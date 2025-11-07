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
let scratchCanvas, scratchCtx;
let isScratching = false;
let scratchesToday = 0;
let maxScratches = 1;
let rewardAmount = 0;

// Initialize scratch card page
document.addEventListener('DOMContentLoaded', async () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            await loadScratchHistory();
            initializeScratchCard();
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
            
            // Load scratch data
            scratchesToday = userData.scratchesToday || 0;
            maxScratches = getMaxScratches(userData.subscription?.planId);
            
            document.getElementById('cardsScratched').textContent = scratchesToday;
            document.getElementById('maxCards').textContent = maxScratches;
            
            // Check if can scratch today
            const scratchBtn = document.getElementById('scratchBtn');
            if (scratchesToday >= maxScratches) {
                scratchBtn.disabled = true;
                scratchBtn.textContent = 'No Cards Left Today';
                document.getElementById('scratchOverlay').innerHTML = `
                    <i class="fas fa-clock text-white text-3xl mb-2"></i>
                    <p class="text-white font-semibold">Come Back Tomorrow</p>
                    <p class="text-white/80 text-sm mt-1">${maxScratches} card${maxScratches > 1 ? 's' : ''} used today</p>
                `;
            } else {
                scratchBtn.disabled = false;
                scratchBtn.textContent = 'Start Scratching';
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Get max scratches based on subscription
function getMaxScratches(planId) {
    const scratches = {
        'free': 1,
        'silver': 2,
        'gold': 3,
        'platinum': 999 // Unlimited
    };
    return scratches[planId] || 1;
}

// Initialize scratch card
function initializeScratchCard() {
    scratchCanvas = document.getElementById('scratchCanvas');
    scratchCtx = scratchCanvas.getContext('2d');
    
    // Set canvas size
    const card = document.querySelector('.scratch-card');
    scratchCanvas.width = card.offsetWidth;
    scratchCanvas.height = card.offsetHeight;
    
    // Draw scratch overlay
    drawScratchOverlay();
    
    // Add event listeners
    setupScratchEvents();
}

// Draw scratch overlay
function drawScratchOverlay() {
    scratchCtx.fillStyle = '#8b5cf6';
    scratchCtx.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    
    // Add pattern
    scratchCtx.fillStyle = '#7c3aed';
    for (let i = 0; i < scratchCanvas.width; i += 20) {
        for (let j = 0; j < scratchCanvas.height; j += 20) {
            if ((i + j) % 40 === 0) {
                scratchCtx.fillRect(i, j, 10, 10);
            }
        }
    }
    
    // Add text
    scratchCtx.fillStyle = '#ffffff';
    scratchCtx.font = 'bold 16px Poppins';
    scratchCtx.textAlign = 'center';
    scratchCtx.fillText('SCRATCH HERE', scratchCanvas.width / 2, scratchCanvas.height / 2);
}

// Setup scratch events
function setupScratchEvents() {
    const scratchBtn = document.getElementById('scratchBtn');
    const scratchOverlay = document.getElementById('scratchOverlay');
    
    scratchBtn.addEventListener('click', startScratching);
    
    // Touch/mouse events for scratching
    scratchCanvas.addEventListener('mousedown', startScratch);
    scratchCanvas.addEventListener('mousemove', scratch);
    scratchCanvas.addEventListener('mouseup', endScratch);
    scratchCanvas.addEventListener('mouseleave', endScratch);
    
    scratchCanvas.addEventListener('touchstart', startScratch);
    scratchCanvas.addEventListener('touchmove', scratch);
    scratchCanvas.addEventListener('touchend', endScratch);
}

// Start scratching session
function startScratching() {
    if (scratchesToday >= maxScratches) return;
    
    // Generate random reward
    rewardAmount = generateRandomReward();
    document.getElementById('rewardAmount').textContent = `₹${rewardAmount.toFixed(2)}`;
    
    // Hide start button
    document.getElementById('scratchBtn').classList.add('hidden');
    
    // Enable scratching
    isScratching = true;
}

// Generate random reward amount
function generateRandomReward() {
    const userDoc = getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data();
    const planId = userData.subscription?.planId;
    
    // Base reward range
    let min = 0.10;
    let max = 0.50;
    
    // Adjust range based on plan
    if (planId === 'gold') {
        min = 0.15;
        max = 0.75;
    } else if (planId === 'platinum') {
        min = 0.20;
        max = 1.00;
    }
    
    // Generate random amount
    const random = Math.random();
    const amount = min + (random * (max - min));
    
    return Math.round(amount * 100) / 100; // Round to 2 decimal places
}

// Start scratch
function startScratch(e) {
    if (!isScratching) return;
    
    e.preventDefault();
    isScratching = true;
    scratch(e);
}

// Scratch movement
function scratch(e) {
    if (!isScratching) return;
    
    e.preventDefault();
    
    const rect = scratchCanvas.getBoundingClientRect();
    let x, y;
    
    if (e.type.includes('touch')) {
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
    } else {
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
    }
    
    // Draw transparent circle to "scratch off"
    scratchCtx.globalCompositeOperation = 'destination-out';
    scratchCtx.beginPath();
    scratchCtx.arc(x, y, 20, 0, Math.PI * 2);
    scratchCtx.fill();
    
    // Check if enough is scratched to reveal reward
    checkScratchCompletion();
}

// End scratch
function endScratch() {
    isScratching = false;
}

// Check if enough area is scratched
function checkScratchCompletion() {
    const imageData = scratchCtx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height);
    const pixels = imageData.data;
    let transparentPixels = 0;
    
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) {
            transparentPixels++;
        }
    }
    
    const totalPixels = pixels.length / 4;
    const scratchedPercentage = (transparentPixels / totalPixels) * 100;
    
    if (scratchedPercentage > 40) { // 40% scratched
        revealReward();
    }
}

// Reveal reward
function revealReward() {
    isScratching = false;
    
    // Show reward display
    document.getElementById('rewardDisplay').classList.remove('hidden');
    document.getElementById('scratchOverlay').style.pointerEvents = 'none';
    
    // Process reward
    processScratchReward();
}

// Process scratch reward
async function processScratchReward() {
    try {
        // Update user data
        await updateDoc(doc(db, 'users', currentUser.uid), {
            balance: increment(rewardAmount),
            totalEarned: increment(rewardAmount),
            scratchesToday: increment(1),
            lastScratchedAt: serverTimestamp()
        });
        
        // Create scratch record
        await updateDoc(doc(db, 'scratches', currentUser.uid + '_' + Date.now()), {
            userId: currentUser.uid,
            reward: rewardAmount,
            createdAt: serverTimestamp()
        });
        
        // Create transaction record
        await updateDoc(doc(db, 'transactions', currentUser.uid + '_' + Date.now()), {
            userId: currentUser.uid,
            amount: rewardAmount,
            type: 'credit',
            description: 'Scratch Card Reward',
            createdAt: serverTimestamp()
        });
        
        // Show success modal after delay
        setTimeout(() => {
            showSuccessModal();
        }, 1000);
        
        // Reload data
        await loadUserData();
        await loadScratchHistory();
        
    } catch (error) {
        console.error('Error processing scratch reward:', error);
        showErrorMessage('Error processing reward. Please try again.');
    }
}

// Load scratch history
async function loadScratchHistory() {
    try {
        const historyQuery = query(
            collection(db, 'scratches'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            
        );
        
        const querySnapshot = await getDocs(historyQuery);
        const historyContainer = document.getElementById('scratchHistory');
        historyContainer.innerHTML = '';
        
        if (querySnapshot.empty) {
            historyContainer.innerHTML = `
                <div class="text-center py-4 text-gray-500">
                    <i class="fas fa-history text-2xl mb-2"></i>
                    <p>No scratch history yet</p>
                </div>
            `;
            return;
        }
        
        querySnapshot.forEach(doc => {
            const scratch = doc.data();
            const historyItem = createScratchHistoryItem(scratch);
            historyContainer.appendChild(historyItem);
        });
        
    } catch (error) {
        console.error('Error loading scratch history:', error);
    }
}

// Create scratch history item
function createScratchHistoryItem(scratch) {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-xl';
    
    const date = scratch.createdAt.toDate();
    const formattedDate = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
    const formattedTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    item.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-ticket-alt text-purple-500 mr-3"></i>
            <div>
                <div class="font-semibold">Scratch Card</div>
                <div class="text-sm text-gray-600">${formattedDate} ${formattedTime}</div>
            </div>
        </div>
        <div class="text-green-600 font-bold">+₹${scratch.reward.toFixed(2)}</div>
    `;
    
    return item;
}

// Show success modal
function showSuccessModal() {
    document.getElementById('modalReward').textContent = `₹${rewardAmount.toFixed(2)}`;
    document.getElementById('successModal').classList.remove('hidden');
}

// Close success modal
document.getElementById('closeSuccess').addEventListener('click', () => {
    document.getElementById('successModal').classList.add('hidden');
    resetScratchCard();
});

// Reset scratch card for next use
function resetScratchCard() {
    // Reset canvas
    drawScratchOverlay();
    
    // Hide reward display
    document.getElementById('rewardDisplay').classList.add('hidden');
    document.getElementById('scratchOverlay').style.pointerEvents = 'auto';
    
    // Show start button if scratches available
    if (scratchesToday < maxScratches) {
        document.getElementById('scratchBtn').classList.remove('hidden');
    }
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
