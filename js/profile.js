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
    signOut 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentUser = null;
let userData = null;

// Initialize profile page
document.addEventListener('DOMContentLoaded', async () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            setupTabNavigation();
            setupEventListeners();
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
            userData = userDoc.data();
            updateProfileUI();
            await loadTransactions();
            await loadProgressData();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Update profile UI with user data
function updateProfileUI() {
    // Basic info
    document.getElementById('userBalance').textContent = userData.balance?.toFixed(2) || '0.00';
    document.getElementById('userName').textContent = userData.name || 'EARNZY User';
    
    // Mobile number (masked)
    const mobile = userData.mobile || '+910000000000';
    const maskedMobile = mobile.replace(/(\+\d{2})(\d{4})(\d{6})/, '$1 •••• $3');
    document.getElementById('userMobile').textContent = maskedMobile;
    document.getElementById('settingsMobile').textContent = maskedMobile;
    
    // Member since
    if (userData.createdAt) {
        const joinDate = userData.createdAt.toDate();
        document.getElementById('memberSince').textContent = joinDate.getFullYear();
    }
    
    // Stats
    document.getElementById('totalEarned').textContent = `₹${userData.totalEarned?.toFixed(2) || '0.00'}`;
    document.getElementById('totalWithdrawn').textContent = `₹${userData.totalWithdrawn?.toFixed(2) || '0.00'}`;
    document.getElementById('tasksCompleted').textContent = userData.totalTasksCompleted || '0';
    document.getElementById('referralsCount').textContent = userData.totalReferrals || '0';
    
    // Current plan
    const subscription = userData.subscription || { planId: 'free' };
    updatePlanInfo(subscription);
    
    // User rank based on total earned
    updateUserRank();
}

// Update user rank
function updateUserRank() {
    const totalEarned = userData.totalEarned || 0;
    let rank = 'Beginner';
    
    if (totalEarned >= 1000) rank = 'Elite Earner';
    else if (totalEarned >= 500) rank = 'Pro Earner';
    else if (totalEarned >= 100) rank = 'Active Earner';
    else if (totalEarned >= 50) rank = 'Rising Star';
    
    document.getElementById('userRank').textContent = rank;
}

// Update plan information
function updatePlanInfo(subscription) {
    const plans = {
        'free': { name: 'Free Plan', expiry: 'Lifetime access' },
        'silver': { name: 'Silver Plan', expiry: '30 days' },
        'gold': { name: 'Gold Plan', expiry: '30 days' },
        'platinum': { name: 'Platinum Plan', expiry: '30 days' }
    };
    
    const plan = plans[subscription.planId] || plans.free;
    document.getElementById('currentPlan').textContent = plan.name;
    document.getElementById('planExpiry').textContent = plan.expiry;
}

// Load progress data
async function loadProgressData() {
    // Task progress
    const tasksCompleted = userData.totalTasksCompleted || 0;
    const taskProgress = Math.min((tasksCompleted / 100) * 100, 100);
    document.getElementById('taskProgressText').textContent = `${tasksCompleted}/100`;
    document.getElementById('taskProgressBar').style.width = `${taskProgress}%`;
    
    // Referral progress
    const referrals = userData.totalReferrals || 0;
    const referralProgress = Math.min((referrals / 10) * 100, 100);
    document.getElementById('referralProgressText').textContent = `${referrals}/10`;
    document.getElementById('referralProgressBar').style.width = `${referralProgress}%`;
    
    // Withdrawal progress
    const withdrawn = userData.totalWithdrawn || 0;
    const withdrawalProgress = Math.min((withdrawn / 1000) * 100, 100);
    document.getElementById('withdrawalProgressText').textContent = `₹${withdrawn}/₹1000`;
    document.getElementById('withdrawalProgressBar').style.width = `${withdrawalProgress}%`;
}

// Load transactions
async function loadTransactions() {
    try {
        const transactionsQuery = query(
            collection(db, 'transactions'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            
        );
        
        const querySnapshot = await getDocs(transactionsQuery);
        const transactionsList = document.getElementById('transactionsList');
        transactionsList.innerHTML = '';
        
        if (querySnapshot.empty) {
            transactionsList.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-receipt text-3xl mb-2"></i>
                    <p>No transactions yet</p>
                    <p class="text-sm mt-2">Your transaction history will appear here</p>
                </div>
            `;
            return;
        }
        
        querySnapshot.forEach(doc => {
            const transaction = doc.data();
            const transactionItem = createTransactionItem(transaction);
            transactionsList.appendChild(transactionItem);
        });
        
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Create transaction item
function createTransactionItem(transaction) {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center p-4 bg-gray-50 rounded-xl transaction-item';
    item.setAttribute('data-type', transaction.type);
    
    const date = transaction.createdAt.toDate();
    const formattedDate = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
    const formattedTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const isCredit = transaction.type === 'credit';
    const amountClass = isCredit ? 'text-green-600' : 'text-red-600';
    const amountPrefix = isCredit ? '+' : '-';
    const icon = isCredit ? 'fa-arrow-down' : 'fa-arrow-up';
    const iconBg = isCredit ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600';
    
    item.innerHTML = `
        <div class="flex items-center space-x-3">
            <div class="w-10 h-10 ${iconBg} rounded-full flex items-center justify-center">
                <i class="fas ${icon}"></i>
            </div>
            <div>
                <div class="font-semibold">${transaction.description}</div>
                <div class="text-sm text-gray-600">${formattedDate} • ${formattedTime}</div>
            </div>
        </div>
        <div class="${amountClass} font-bold">
            ${amountPrefix}₹${transaction.amount.toFixed(2)}
        </div>
    `;
    
    return item;
}

// Setup tab navigation
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Show active tab content
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    // Transaction filters
    document.querySelectorAll('.transaction-filter').forEach(button => {
        button.addEventListener('click', (e) => {
            const filter = e.currentTarget.getAttribute('data-filter');
            
            // Update active filter button
            document.querySelectorAll('.transaction-filter').forEach(btn => {
                btn.classList.remove('bg-green-500', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            });
            e.currentTarget.classList.remove('bg-gray-200', 'text-gray-700');
            e.currentTarget.classList.add('bg-green-500', 'text-white');
            
            // Filter transactions
            filterTransactions(filter);
        });
    });
    
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        const confirmed = confirm('Are you sure you want to logout?');
        if (confirmed) {
            try {
                await signOut(auth);
                window.location.href = 'login.html';
            } catch (error) {
                console.error('Error signing out:', error);
                showErrorMessage('Error logging out. Please try again.');
            }
        }
    });
}

// Filter transactions
function filterTransactions(filter) {
    const transactionItems = document.querySelectorAll('.transaction-item');
    
    transactionItems.forEach(item => {
        const type = item.getAttribute('data-type');
        
        if (filter === 'all' || filter === type) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Show error message
function showErrorMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-xl shadow-lg z-50';
    toast.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i>${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}
