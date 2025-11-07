import { auth, db } from './firebase-init.js';
import { 
    doc, 
    getDoc, 
    updateDoc,
    collection,
    getDocs,
    query,
    where,
    serverTimestamp,
    increment 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentUser = null;
let currentAd = null;
let adTimer = null;
let adDuration = 30;
let timeRemaining = adDuration;

// Initialize ads page
document.addEventListener('DOMContentLoaded', async () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            await loadAds();
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
            document.getElementById('adsWatched').textContent = userData.adsWatchedToday || 0;
            document.getElementById('todayEarnings').textContent = userData.todayEarnings?.toFixed(2) || '0.00';
            
            // Update progress
            const watched = userData.adsWatchedToday || 0;
            const progress = (watched / 10) * 100;
            document.getElementById('progressBar').style.width = `${progress}%`;
            document.getElementById('progressCount').textContent = watched;
            
            // Bonus progress
            const bonusProgress = watched >= 5 ? '5/5' : `${watched}/5`;
            document.getElementById('bonusProgress').textContent = bonusProgress;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Load available ads
async function loadAds() {
    try {
        const adsQuery = query(collection(db, 'ads'), where('status', '==', 'active'));
        const querySnapshot = await getDocs(adsQuery);
        const adsList = document.getElementById('adsList');
        
        adsList.innerHTML = '';
        
        if (querySnapshot.empty) {
            adsList.innerHTML = `
                <div class="text-center py-8">
                    <div class="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-play-circle text-gray-400 text-2xl"></i>
                    </div>
                    <p class="text-gray-500">No ads available at the moment</p>
                    <p class="text-gray-400 text-sm mt-2">Check back later for new ads</p>
                </div>
            `;
            return;
        }
        
        querySnapshot.forEach((doc) => {
            const ad = doc.data();
            const adCard = createAdCard(ad, doc.id);
            adsList.appendChild(adCard);
        });
        
    } catch (error) {
        console.error('Error loading ads:', error);
    }
}

// Create ad card HTML
function createAdCard(ad, adId) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl p-4 shadow-lg border border-gray-100 ad-card';
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div class="flex-1">
                <h3 class="font-semibold text-gray-800">${ad.title}</h3>
                <p class="text-gray-600 text-sm mt-1">${ad.description}</p>
            </div>
            <div class="text-right">
                <div class="text-green-600 font-bold">₹${ad.reward}</div>
                <div class="text-gray-500 text-xs">${ad.duration || '30s'}</div>
            </div>
        </div>
        
        <div class="flex justify-between items-center">
            <div class="flex items-center text-sm text-gray-500">
                <i class="fas fa-eye mr-1"></i>
                <span>${ad.watchedCount || 0} views</span>
            </div>
            <button class="ad-watch-btn bg-green-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-green-600 transition duration-300" data-ad-id="${adId}">
                Watch Ad
            </button>
        </div>
    `;
    
    return card;
}

// Ad modal functionality
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('ad-watch-btn')) {
        const adId = e.target.getAttribute('data-ad-id');
        openAdModal(adId);
    }
});

// Open ad modal
async function openAdModal(adId) {
    try {
        const adDoc = await getDoc(doc(db, 'ads', adId));
        if (!adDoc.exists()) return;
        
        currentAd = { id: adId, ...adDoc.data() };
        adDuration = currentAd.duration || 30;
        timeRemaining = adDuration;
        
        // Update modal content
        document.getElementById('adTitle').textContent = currentAd.title;
        document.getElementById('adDescription').textContent = currentAd.description;
        
        // Calculate reward with plan bonus
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        const planMultiplier = getAdPlanMultiplier(userData.subscription?.planId);
        const finalReward = currentAd.reward * planMultiplier;
        
        document.getElementById('adReward').textContent = `₹${finalReward.toFixed(2)}`;
        
        // Show bonus info if applicable
        const bonusInfo = document.getElementById('bonusInfo');
        if (planMultiplier > 1) {
            bonusInfo.textContent = `Includes ${((planMultiplier - 1) * 100).toFixed(0)}% plan bonus`;
            bonusInfo.classList.remove('hidden');
        } else {
            bonusInfo.classList.add('hidden');
        }
        
        // Reset progress
        document.getElementById('adProgress').style.width = '0%';
        document.getElementById('timeLeft').textContent = `${adDuration} seconds remaining`;
        document.getElementById('adCountdown').textContent = '5';
        
        // Show modal
        document.getElementById('adModal').classList.remove('hidden');
        
        // Start pre-countdown
        startPreCountdown();
        
    } catch (error) {
        console.error('Error opening ad modal:', error);
    }
}

// Start pre-countdown before ad
function startPreCountdown() {
    let countdown = 5;
    const countdownElement = document.getElementById('adCountdown');
    const watchBtn = document.getElementById('watchAdBtn');
    
    watchBtn.disabled = true;
    watchBtn.textContent = 'Preparing ad...';
    
    const preTimer = setInterval(() => {
        countdown--;
        countdownElement.textContent = countdown;
        
        if (countdown <= 0) {
            clearInterval(preTimer);
            startAdWatch();
        }
    }, 1000);
}

// Start watching ad
function startAdWatch() {
    document.getElementById('adPlaceholder').classList.add('hidden');
    document.getElementById('watchAdBtn').textContent = 'Watching...';
    document.getElementById('watchAdBtn').disabled = true;
    
    // Simulate ad playback (in real app, this would be actual video)
    simulateAdPlayback();
}

// Simulate ad playback with timer
function simulateAdPlayback() {
    timeRemaining = adDuration;
    updateProgress();
    
    adTimer = setInterval(() => {
        timeRemaining--;
        updateProgress();
        
        if (timeRemaining <= 0) {
            clearInterval(adTimer);
            completeAdWatch();
        }
    }, 1000);
}

// Update progress during ad playback
function updateProgress() {
    const progress = ((adDuration - timeRemaining) / adDuration) * 100;
    document.getElementById('adProgress').style.width = `${progress}%`;
    document.getElementById('timeLeft').textContent = `${timeRemaining} seconds remaining`;
}

// Complete ad watch and reward user
async function completeAdWatch() {
    try {
        // Calculate final reward
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        const planMultiplier = getAdPlanMultiplier(userData.subscription?.planId);
        const finalReward = currentAd.reward * planMultiplier;
        
        // Update user data
        await updateDoc(doc(db, 'users', currentUser.uid), {
            balance: increment(finalReward),
            totalEarned: increment(finalReward),
            todayEarnings: increment(finalReward),
            adsWatchedToday: increment(1),
            lastAdWatchedAt: serverTimestamp()
        });
        
        // Create transaction record
        await updateDoc(doc(db, 'transactions', currentUser.uid + '_' + Date.now()), {
            userId: currentUser.uid,
            amount: finalReward,
            type: 'credit',
            description: `Ad: ${currentAd.title}`,
            adId: currentAd.id,
            createdAt: serverTimestamp()
        });
        
        // Update ad watch count
        await updateDoc(doc(db, 'ads', currentAd.id), {
            watchedCount: increment(1),
            lastWatchedAt: serverTimestamp()
        });
        
        // Show success message
        showSuccessMessage(`Ad completed! ₹${finalReward.toFixed(2)} added to your balance.`);
        
        // Close modal
        document.getElementById('adModal').classList.add('hidden');
        
        // Reload data
        await loadUserData();
        await loadAds();
        
        // Check for treasure box unlock
        checkAdTreasureUnlock();
        
    } catch (error) {
        console.error('Error completing ad:', error);
        showErrorMessage('Error completing ad. Please try again.');
    }
}

// Get ad plan multiplier
function getAdPlanMultiplier(planId) {
    const multipliers = {
        'free': 1.0,
        'silver': 1.1,
        'gold': 1.2,
        'platinum': 1.3
    };
    return multipliers[planId] || 1.0;
}

// Check if treasure box should be unlocked via ads
async function checkAdTreasureUnlock() {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data();
    
    if (userData.adsWatchedToday >= 5) {
        // Unlock treasure box
        await updateDoc(doc(db, 'users', currentUser.uid), {
            treasureUnlocked: true
        });
        
        showSuccessMessage('🎉 Treasure Box unlocked! Complete 2 more ads or 3 tasks to open it.');
    }
}

// Close ad modal
document.getElementById('closeAdModal').addEventListener('click', () => {
    if (adTimer) {
        clearInterval(adTimer);
        adTimer = null;
    }
    document.getElementById('adModal').classList.add('hidden');
    currentAd = null;
});

// Cancel ad watching
document.getElementById('watchAdBtn').addEventListener('click', () => {
    if (adTimer) {
        clearInterval(adTimer);
        adTimer = null;
    }
    document.getElementById('adModal').classList.add('hidden');
});

// Show success message
function showSuccessMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg z-50';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

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
