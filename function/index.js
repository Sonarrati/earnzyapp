const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// Cloud Function: On User Signup
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  try {
    const userRef = db.collection('users').doc(user.uid);
    
    // Create user document with initial data
    await userRef.set({
      uid: user.uid,
      mobile: user.phoneNumber,
      balance: 2.00, // ₹2 signup bonus
      totalEarned: 2.00,
      subscription: {
        planId: 'free',
        status: 'active'
      },
      tasksCompletedToday: 0,
      adsWatchedToday: 0,
      scratchesToday: 0,
      streak: {
        day: 0,
        lastCheckinAt: null
      },
      deviceIds: [user.uid], // Store device ID for fraud detection
      fraudFlags: {
        count: 0,
        reasons: []
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      totalTasksCompleted: 0,
      totalReferrals: 0,
      referralEarnings: 0,
      totalWithdrawn: 0
    });

    // Create signup bonus transaction
    await db.collection('transactions').doc(`${user.uid}_signup`).set({
      userId: user.uid,
      amount: 2.00,
      type: 'credit',
      description: 'Signup Bonus',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`New user created: ${user.uid}`);
  } catch (error) {
    console.error('Error creating user document:', error);
  }
});

// Cloud Function: On Task Completion
exports.onTaskComplete = functions.firestore
  .document('transactions/{transactionId}')
  .onCreate(async (snapshot, context) => {
    const transaction = snapshot.data();
    
    // Only process task completions
    if (transaction.type !== 'credit' || !transaction.taskId) {
      return null;
    }

    try {
      const userRef = db.collection('users').doc(transaction.userId);
      const taskRef = db.collection('tasks').doc(transaction.taskId);

      // Update user's task completion count
      await userRef.update({
        totalTasksCompleted: admin.firestore.FieldValue.increment(1),
        tasksCompletedToday: admin.firestore.FieldValue.increment(1)
      });

      // Update task completion count
      await taskRef.update({
        completedCount: admin.firestore.FieldValue.increment(1),
        lastCompletedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Task ${transaction.taskId} completed by user ${transaction.userId}`);
    } catch (error) {
      console.error('Error processing task completion:', error);
    }
  });

// Cloud Function: On Referral Completion
exports.onReferralComplete = functions.firestore
  .document('referrals/{referralId}')
  .onCreate(async (snapshot, context) => {
    const referral = snapshot.data();
    
    try {
      const referrerRef = db.collection('users').doc(referral.referrerId);
      
      // Update referrer's stats
      await referrerRef.update({
        totalReferrals: admin.firestore.FieldValue.increment(1),
        referralEarnings: admin.firestore.FieldValue.increment(referral.amount || 2.00)
      });

      // Add referral bonus to referrer's balance
      await referrerRef.update({
        balance: admin.firestore.FieldValue.increment(referral.amount || 2.00),
        totalEarned: admin.firestore.FieldValue.increment(referral.amount || 2.00)
      });

      // Create referral bonus transaction
      await db.collection('transactions').doc(`${referral.referrerId}_referral_${Date.now()}`).set({
        userId: referral.referrerId,
        amount: referral.amount || 2.00,
        type: 'credit',
        description: `Referral Bonus - ${referral.referredName || 'New User'}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Referral bonus processed for user ${referral.referrerId}`);
    } catch (error) {
      console.error('Error processing referral completion:', error);
    }
  });

// Cloud Function: Daily Reset
exports.dailyReset = functions.pubsub.schedule('0 0 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    try {
      const usersSnapshot = await db.collection('users').get();
      
      const batch = db.batch();
      usersSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          tasksCompletedToday: 0,
          adsWatchedToday: 0,
          scratchesToday: 0,
          treasureOpenedToday: false
        });
      });

      await batch.commit();
      console.log('Daily reset completed for all users');
    } catch (error) {
      console.error('Error in daily reset:', error);
    }
  });

// Cloud Function: Anti-Fraud Check
exports.antiFraudCheck = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Check for suspicious activity
    const suspiciousActivities = [];

    // Rapid balance increase check
    if (after.balance - before.balance > 50) {
      suspiciousActivities.push('Rapid balance increase');
    }

    // Multiple device check (simplified)
    if (after.deviceIds && after.deviceIds.length > 3) {
      suspiciousActivities.push('Multiple devices detected');
    }

    // If suspicious activities found, update fraud flags
    if (suspiciousActivities.length > 0) {
      await change.after.ref.update({
        'fraudFlags.count': admin.firestore.FieldValue.increment(1),
        'fraudFlags.reasons': admin.firestore.FieldValue.arrayUnion(...suspiciousActivities),
        'fraudFlags.lastChecked': admin.firestore.FieldValue.serverTimestamp()
      });

      // Log fraud attempt
      await db.collection('fraud_logs').doc(`${context.params.userId}_${Date.now()}`).set({
        userId: context.params.userId,
        activities: suspiciousActivities,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Fraud detection triggered for user ${context.params.userId}`);
    }
  });

// Cloud Function: Process Withdrawal
exports.processWithdrawal = functions.firestore
  .document('withdrawals/{withdrawalId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Only process when status changes to 'completed'
    if (before.status !== 'completed' && after.status === 'completed') {
      try {
        const userRef = db.collection('users').doc(after.userId);
        
        // Update user's withdrawal stats
        await userRef.update({
          totalWithdrawn: admin.firestore.FieldValue.increment(after.amount),
          balance: admin.firestore.FieldValue.increment(-after.amount)
        });

        console.log(`Withdrawal processed for user ${after.userId}: ₹${after.amount}`);
      } catch (error) {
        console.error('Error processing withdrawal:', error);
      }
    }
  });

// Cloud Function: Subscription Webhook (for Razorpay)
exports.subscriptionWebhook = functions.https.onRequest(async (req, res) => {
  // Verify webhook signature (implementation depends on payment provider)
  const signature = req.headers['x-razorpay-signature'];
  
  try {
    const event = req.body;
    
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const userId = payment.notes.userId;
      const planId = payment.notes.planId;
      
      // Calculate expiry date (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      // Update user subscription
      await db.collection('users').doc(userId).update({
        subscription: {
          planId: planId,
          status: 'active',
          purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: expiresAt,
          paymentId: payment.id
        }
      });
      
      // Create subscription record
      await db.collection('subscriptions').doc(`${userId}_${Date.now()}`).set({
        userId: userId,
        planId: planId,
        amount: payment.amount / 100, // Convert from paise to rupees
        paymentId: payment.id,
        status: 'completed',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiresAt
      });
      
      console.log(`Subscription activated for user ${userId}: ${planId} plan`);
    }
    
    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(400).send('Webhook processing failed');
  }
});

// Cloud Function: Send Notification
exports.sendNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snapshot, context) => {
    const notification = snapshot.data();
    
    try {
      // Get user's FCM token (you would store this in user document)
      const userDoc = await db.collection('users').doc(notification.userId).get();
      const fcmToken = userDoc.data().fcmToken;
      
      if (!fcmToken) {
        console.log('No FCM token for user:', notification.userId);
        return;
      }
      
      const message = {
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: {
          type: notification.type,
          click_action: notification.clickAction || 'FLUTTER_NOTIFICATION_CLICK'
        }
      };
      
      await admin.messaging().send(message);
      console.log('Notification sent to user:', notification.userId);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  });
