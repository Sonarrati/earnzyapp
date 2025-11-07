import { auth, db } from './firebase-init.js';
import { 
    doc, 
    getDoc, 
    updateDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentUser = null;
let selectedPlan = null;
let selectedAmount = null;

// Initialize subscriptions page
document.addEventListener('DOMContentLoaded', async () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            setupUpgradeButtons();
        } else {
            window.location.href = 'login.html';
        }
    });
});

// Load user data
async function loadUserData() {
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // Update UI
            document.getElementById('userBalance').textContent = userData.balance?.toFixed(2) || '0.00';
            
            // Update current plan info
            const subscription = userData.subscription || { planId: 'free' };
            updateCurrentPlanInfo(subscription);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Update current plan information
function updateCurrentPlanInfo(subscription) {
    const planId = subscription.planId || 'free';
    const plans = {
        'free': { name: 'Free Plan', price: '₹0', duration: 'Lifetime' },
        'silver': { name: 'Silver Plan', price: '₹99', duration: '30 Days' },
        'gold': { name: 'Gold Plan', price: '₹199', duration: '30 Days' },
        'platinum': { name: 'Platinum Plan', price: '₹499', duration: '30 Days' }
    };
    
    const plan = plans[planId];
    document.getElementById('currentPlanText').textContent = plan.name;
    document.getElementById('currentPlanPrice').textContent = plan.price;
    document.getElementById('currentPlanDuration').textContent = plan.duration;
    
    // Show expiry for paid plans
    if (planId !== 'free' && subscription.expiresAt) {
        const expiryDate = subscription.expiresAt.toDate();
        const today = new Date();
        const diffTime = expiryDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) {
            document.getElementById('planExpiry').classList.remove('hidden');
            document.getElementById('expiryDays').textContent = `${diffDays} days`;
        }
    }
    
    // Disable upgrade button for current plan
    const currentPlanBtn = document.querySelector(`.upgrade-btn[data-plan="${planId}"]`);
    if (currentPlanBtn) {
        currentPlanBtn.disabled = true;
        currentPlanBtn.textContent = 'Current Plan';
        currentPlanBtn.classList.remove('bg-gray-200', 'gradient-bg', 'bg-purple-500');
        currentPlanBtn.classList.add('bg-green-500', 'text-white');
    }
}

// Setup upgrade buttons
function setupUpgradeButtons() {
    document.querySelectorAll('.upgrade-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            if (button.disabled) return;
            
            selectedPlan = e.currentTarget.getAttribute('data-plan');
            selectedAmount = parseInt(e.currentTarget.getAttribute('data-amount'));
            
            openPaymentModal(selectedPlan, selectedAmount);
        });
    });
}

// Open payment modal
function openPaymentModal(plan, amount) {
    const planNames = {
        'silver': 'Silver Plan',
        'gold': 'Gold Plan', 
        'platinum': 'Platinum Plan'
    };
    
    const planBenefits = {
        'silver': [
            '+20% Task Bonus',
            '+10% Ad Bonus', 
            '2 Scratch Cards/Day',
            '+10% Check-in Bonus',
            '₹2.5 Referral Bonus',
            '12-24h Withdrawal'
        ],
        'gold': [
            '+30% Task Bonus',
            '+20% Ad Bonus',
            '3 Scratch Cards/Day', 
            '+20% Check-in Bonus',
            '₹3 Referral Bonus',
            'Instant Withdrawal',
            'Chat Support'
        ],
        'platinum': [
            '+50% Task Bonus',
            '+30% Ad Bonus',
            'Unlimited Scratch Cards',
            '+30% Check-in Bonus', 
            '₹5 Referral Bonus',
            'Instant Withdrawal',
            'VIP Chat Support',
            'Ad-Free Experience'
        ]
    };
    
    // Update modal content
    document.getElementById('selectedPlan').textContent = planNames[plan];
    document.getElementById('selectedAmount').textContent = `₹${amount}`;
    
    const benefitsList = document.getElementById('planBenefits');
    benefitsList.innerHTML = '';
    
    planBenefits[plan].forEach(benefit => {
        const li = document.createElement('li');
        li.className = 'flex items-center';
        li.innerHTML = `<i class="fas fa-check text-green-500 mr-2 text-xs"></i>${benefit}`;
        benefitsList.appendChild(li);
    });
    
    // Show modal
    document.getElementById('paymentModal').classList.remove('hidden');
}

// Close payment modal
document.getElementById('closePaymentModal').addEventListener('click', () => {
    document.getElementById('paymentModal').classList.add('hidden');
});

// Razorpay payment
document.getElementById('razorpayBtn').addEventListener('click', async () => {
    await initiateRazorpayPayment();
});

// UPI payment
document.getElementById('upiBtn').addEventListener('click', async () => {
    await initiateUPIPayment();
});

// Initiate Razorpay payment
async function initiateRazorpayPayment() {
    try {
        // In a real application, you would call your backend to create an order
        // For demo purposes, we'll simulate the payment flow
        
        const options = {
            key: "YOUR_RAZORPAY_KEY_ID", // Replace with actual Razorpay key
            amount: selectedAmount * 100, // Amount in paise
            currency: "INR",
            name: "EARNZY",
            description: `${selectedPlan.toUpperCase()} Plan Subscription`,
            image: "/images/logo.png",
            handler: async function(response) {
                // Payment successful
                await handlePaymentSuccess(response.razorpay_payment_id);
            },
            prefill: {
                name: "User Name", // You can get this from user data
                email: "user@example.com", // You can get this from user data
                contact: "9999999999" // You can get this from user data
            },
            notes: {
                plan: selectedPlan,
                userId: currentUser.uid
            },
            theme: {
                color: "#16a34a"
            }
        };
        
        const rzp = new Razorpay(options);
        rzp.open();
        
    } catch (error) {
        console.error('Error initiating Razorpay payment:', error);
        showErrorMessage('Payment initialization failed. Please try again.');
    }
}

// Initiate UPI payment
async function initiateUPIPayment() {
    try {
        // For UPI payments, you would typically generate a UPI ID or use a payment gateway
        // For demo, we'll simulate the payment process
        
        const upiId = `earnzy@axisbank`; // Example UPI ID
        const amount = selectedAmount;
        
        // Create UPI payment URL
        const upiUrl = `upi://pay?pa=${upiId}&pn=EARNZY&am=${amount}&cu=INR&tn=${selectedPlan} Plan Subscription`;
        
        // Try to open UPI app
        window.location.href = upiUrl;
        
        // Fallback: Show UPI details for manual payment
        setTimeout(() => {
            const confirmed = confirm(`UPI Payment Details:\n\nUPI ID: ${upiId}\nAmount: ₹${amount}\n\nPlease make the payment and confirm below.`);
            
            if (confirmed) {
                // Simulate payment verification
                simulatePaymentVerification();
            }
        }, 1000);
        
    } catch (error) {
        console.error('Error initiating UPI payment:', error);
        showErrorMessage('UPI payment initialization failed. Please try again.');
    }
}

// Simulate payment verification (for demo)
async function simulatePaymentVerification() {
    try {
        // In real app, verify payment with your backend
        const paymentId = 'upi_' + Date.now();
        await handlePaymentSuccess(paymentId);
        
    } catch (error) {
        console.error('Error verifying payment:', error);
        showErrorMessage('Payment verification failed. Please contact support.');
    }
}

// Handle successful payment
async function handlePaymentSuccess(paymentId) {
    try {
        // Calculate expiry date (30 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        // Update user subscription
        await updateDoc(doc(db, 'users', currentUser.uid), {
            subscription: {
                planId: selectedPlan,
                status: 'active',
                purchasedAt: serverTimestamp(),
                expiresAt: expiresAt,
                paymentId: paymentId
            },
            lastUpgradedAt: serverTimestamp()
        });
        
        // Create subscription record
        await updateDoc(doc(db, 'subscriptions', currentUser.uid + '_' + Date.now()), {
            userId: currentUser.uid,
            planId: selectedPlan,
            amount: selectedAmount,
            paymentId: paymentId,
            status: 'completed',
            createdAt: serverTimestamp(),
            expiresAt: expiresAt
        });
        
        // Create transaction record
        await updateDoc(doc(db, 'transactions', currentUser.uid + '_' + Date.now()), {
            userId: currentUser.uid,
            amount: selectedAmount,
            type: 'debit',
            description: `${selectedPlan.toUpperCase()} Plan Subscription`,
            createdAt: serverTimestamp()
        });
        
        // Close payment modal
        document.getElementById('paymentModal').classList.add('hidden');
        
        // Show success message
        showSuccessMessage(`🎉 Success! Your ${selectedPlan.toUpperCase()} plan has been activated.`);
        
        // Reload user data
        await loadUserData();
        
    } catch (error) {
        console.error('Error handling payment success:', error);
        showErrorMessage('Error activating your plan. Please contact support.');
    }
}

// Show success message
function showSuccessMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg z-50';
    toast.innerHTML = `<i class="fas fa-check-circle mr-2"></i>${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Show error message
function showErrorMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-xl shadow-lg z-50';
    toast.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i>${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}
