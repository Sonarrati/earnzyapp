import { auth, db } from './firebase-init.js';
import { 
    doc, 
    getDoc, 
    updateDoc,
    collection,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    increment 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentUser = null;
let userStreakData = null;

// Initialize check-in page
document.addEventListener('DOMContentLoaded', async () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            await loadStreakData();
            await loadCheckinHistory();
            renderStreakCalendar();
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
            
            // Load streak data
            userStreakData = userData.streak || { day: 0, lastCheckinAt: null };
            document.getElementById('currentStreak').textContent = userStreakData.day || 0;
            document.getElementById('longestStreak').textContent = userData.longestStreak || 0;
            document.getElementById('totalCheckins').textContent = userData.totalCheckins || 0;
            
            // Check if already checked in today
            const today = new Date().toDateString();
            const lastCheckin = userStreakData.lastCheckinAt ? new Date(userStreakData.lastCheckinAt.toDate()).toDateString() : null;
            
            const checkinBtn = document.getElementById('checkinBtn');
            if (lastCheckin === today) {
                checkinBtn.disabled = true;
                checkinBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Already Checked In Today';
            } else {
                checkinBtn.disabled = false;
                checkinBtn.innerHTML = '<i class="fas fa-calendar-check mr-2"></i>Check In Today';
            }
            
            // Calculate today's reward
            calculateTodaysReward();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Load streak data
async function loadStreakData() {
    try {
        const streakQuery = query(
            collection(db, 'checkins'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            where('createdAt', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        );
        
        const querySnapshot = await getDocs(streakQuery);
        const checkins = [];
        querySnapshot.forEach(doc => {
            checkins.push(doc.data());
        });
        
        return checkins;
    } catch (error) {
        console.error('Error loading streak data:', error);
        return [];
    }
}

// Load check-in history
async function loadCheckinHistory() {
    try {
        const historyQuery = query(
            collection(db, 'checkins'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            
        );
        
        const querySnapshot = await getDocs(historyQuery);
        const historyContainer = document.getElementById('checkinHistory');
        historyContainer.innerHTML = '';
        
        if (querySnapshot.empty) {
            historyContainer.innerHTML = `
                <div class="text-center py-4 text-gray-500">
                    <i class="fas fa-history text-2xl mb-2"></i>
                    <p>No check-in history yet</p>
                </div>
            `;
            return;
        }
        
        querySnapshot.forEach(doc => {
            const checkin = doc.data();
            const historyItem = createHistoryItem(checkin);
            historyContainer.appendChild(historyItem);
        });
        
    } catch (error) {
        console.error('Error loading check-in history:', error);
    }
}

// Create history item
function createHistoryItem(checkin) {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-xl';
    
    const date = checkin.createdAt.toDate();
    const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    
    item.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-calendar-check text-green-500 mr-3"></i>
            <div>
                <div class="font-semibold">${formattedDate}</div>
                <div class="text-sm text-gray-600">Streak: ${checkin.streakDay} days</div>
            </div>
        </div>
        <div class="text-green-600 font-bold">+₹${checkin.reward.toFixed(2)}</div>
    `;
    
    return item;
}

// Calculate today's reward
function calculateTodaysReward() {
    const currentStreak = userStreakData.day || 0;
    let baseReward = 0.20;
    
    // Calculate reward based on streak
    if (currentStreak >= 30) baseReward = 1.00;
    else if (currentStreak >= 7) baseReward = 0.50;
    else if (currentStreak >= 3) baseReward = 0.30;
    
    // Apply plan multiplier
    getPlanMultiplier().then(multiplier => {
        const finalReward = baseReward * multiplier;
        document.getElementById('rewardAmount').textContent = finalReward.toFixed(2);
        
        // Show bonus info
        const bonusInfo = document.getElementById('bonusInfo');
        if (multiplier > 1) {
            bonusInfo.textContent = `Includes ${((multiplier - 1) * 100).toFixed(0)}% plan bonus`;
            bonusInfo.classList.remove('hidden');
        } else {
            bonusInfo.classList.add('hidden');
        }
    });
}

// Get plan multiplier for check-in
async function getPlanMultiplier() {
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        const planId = userData.subscription?.planId;
        
        const multipliers = {
            'free': 1.0,
            'silver': 1.1,
            'gold': 1.2,
            'platinum': 1.3
        };
        
        return multipliers[planId] || 1.0;
    } catch (error) {
        return 1.0;
    }
}

// Render streak calendar
function renderStreakCalendar() {
    const calendarGrid = document.querySelector('.calendar-grid');
    calendarGrid.innerHTML = '';
    
    const today = new Date();
    const currentStreak = userStreakData.day || 0;
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        
        const dayElement = document.createElement('div');
        dayElement.className = 'streak-day w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-sm font-semibold';
        
        // Check if this day is in the streak
        const daysAgo = 6 - i;
        const streakDay = currentStreak - daysAgo;
        
        if (streakDay > 0) {
            dayElement.classList.add('completed', 'text-white');
            dayElement.textContent = streakDay;
        } else if (daysAgo === 0) {
            dayElement.classList.add('current');
            dayElement.textContent = 'Today';
            dayElement.title = 'Check in today!';
        } else {
            dayElement.textContent = '';
            dayElement.innerHTML = '<i class="fas fa-lock text-gray-300"></i>';
        }
        
        calendarGrid.appendChild(dayElement);
    }
}

// Check-in button handler
document.getElementById('checkinBtn').addEventListener('click', async () => {
    await processCheckin();
});

// Process check-in
async function processCheckin() {
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        const currentStreak = userStreakData.day || 0;
        
        // Calculate new streak
        const today = new Date();
        const lastCheckin = userStreakData.lastCheckinAt ? new Date(userStreakData.lastCheckinAt.toDate()) : null;
        const isConsecutive = lastCheckin && 
                            (today.toDateString() === new Date(lastCheckin.getTime() + 24 * 60 * 60 * 1000).toDateString());
        
        const newStreak = isConsecutive ? currentStreak + 1 : 1;
        
        // Calculate reward
        let baseReward = 0.20;
        if (newStreak >= 30) baseReward = 1.00;
        else if (newStreak >= 7) baseReward = 0.50;
        else if (newStreak >= 3) baseReward = 0.30;
        
        const planMultiplier = await getPlanMultiplier();
        const finalReward = baseReward * planMultiplier;
        
        // Update user data
        await updateDoc(doc(db, 'users', currentUser.uid), {
            balance: increment(finalReward),
            totalEarned: increment(finalReward),
            'streak.day': newStreak,
            'streak.lastCheckinAt': serverTimestamp(),
            totalCheckins: increment(1),
            longestStreak: newStreak > (userData.longestStreak || 0) ? newStreak : userData.longestStreak
        });
        
        // Create check-in record
        await updateDoc(doc(db, 'checkins', currentUser.uid + '_' + Date.now()), {
            userId: currentUser.uid,
            reward: finalReward,
            streakDay: newStreak,
            createdAt: serverTimestamp()
        });
        
        // Create transaction record
        await updateDoc(doc(db, 'transactions', currentUser.uid + '_' + Date.now()), {
            userId: currentUser.uid,
            amount: finalReward,
            type: 'credit',
            description: `Daily Check-in (Day ${newStreak})`,
            createdAt: serverTimestamp()
        });
        
        // Show success modal
        showSuccessModal(finalReward, newStreak);
        
        // Reload data
        await loadUserData();
        await loadCheckinHistory();
        renderStreakCalendar();
        
    } catch (error) {
        console.error('Error processing check-in:', error);
        showErrorMessage('Error processing check-in. Please try again.');
    }
}

// Show success modal
function showSuccessModal(reward, newStreak) {
    document.getElementById('successReward').textContent = reward.toFixed(2);
    document.getElementById('successStreak').textContent = `${newStreak} day${newStreak > 1 ? 's' : ''}`;
    
    // Calculate next reward
    let nextReward = 0.20;
    if (newStreak + 1 >= 30) nextReward = 1.00;
    else if (newStreak + 1 >= 7) nextReward = 0.50;
    else if (newStreak + 1 >= 3) nextReward = 0.30;
    else if (newStreak + 1 >= 2) nextReward = 0.20;
    
    document.getElementById('nextReward').textContent = `₹${nextReward.toFixed(2)}`;
    document.getElementById('successModal').classList.remove('hidden');
}

// Close success modal
document.getElementById('closeSuccess').addEventListener('click', () => {
    document.getElementById('successModal').classList.add('hidden');
});

// Show error message
function showErrorMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-xl shadow-lg z-50';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}
