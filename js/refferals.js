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
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentUser = null;
let referralCode = '';
let referralLink = '';

// Initialize referrals page
document.addEventListener('DOMContentLoaded', async () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            await generateReferralCode();
            await loadReferralHistory();
            setupShareButtons();
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
            document.getElementById('totalReferrals').textContent = userData.totalReferrals || 0;
            document.getElementById('referralEarnings').textContent = (userData.referralEarnings || 0).toFixed(2);
            document.getElementById('pendingBonus').textContent = (userData.pendingBonus || 0).toFixed(2);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Generate or get referral code
async function generateReferralCode() {
    try {
        // Check if user already has a referral code
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        
        if (userData.referralCode) {
            referralCode = userData.referralCode;
        } else {
            // Generate new referral code (6 characters)
            referralCode = generateRandomCode(6);
            
            // Save to user document
            await updateDoc(doc(db, 'users', currentUser.uid), {
                referralCode: referralCode,
                referralCreatedAt: serverTimestamp()
            });
        }
        
        // Update UI
        document.getElementById('referralCode').textContent = referralCode;
        
        // Generate referral link
        referralLink = `${window.location.origin}/index.html?ref=${referralCode}`;
        document.getElementById('referralLink').value = referralLink;
        
    } catch (error) {
        console.error('Error generating referral code:', error);
    }
}

// Generate random referral code
function generateRandomCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Load referral history
async function loadReferralHistory() {
    try {
        const historyQuery = query(
            collection(db, 'referrals'),
            where('referrerId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        
        const querySnapshot = await getDocs(historyQuery);
        const historyContainer = document.getElementById('referralHistory');
        historyContainer.innerHTML = '';
        
        if (querySnapshot.empty) {
            historyContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-users text-3xl mb-2"></i>
                    <p>No referrals yet</p>
                    <p class="text-sm mt-2">Start sharing your code to see referrals here</p>
                </div>
            `;
            return;
        }
        
        querySnapshot.forEach(doc => {
            const referral = doc.data();
            const historyItem = createReferralHistoryItem(referral);
            historyContainer.appendChild(historyItem);
        });
        
    } catch (error) {
        console.error('Error loading referral history:', error);
    }
}

// Create referral history item
function createReferralHistoryItem(referral) {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center p-4 bg-gray-50 rounded-xl';
    
    const date = referral.createdAt.toDate();
    const formattedDate = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
    
    let statusBadge = '';
    let amountText = '';
    
    if (referral.status === 'completed') {
        statusBadge = '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Completed</span>';
        amountText = `<div class="text-green-600 font-bold">+₹${referral.amount?.toFixed(2) || '0.00'}</div>`;
    } else if (referral.status === 'pending') {
        statusBadge = '<span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">Pending Task</span>';
        amountText = `<div class="text-gray-500 text-sm">+₹${referral.pendingAmount?.toFixed(2) || '1.00'} pending</div>`;
    } else {
        statusBadge = '<span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">Signed Up</span>';
        amountText = `<div class="text-green-600 font-bold">+₹${referral.amount?.toFixed(2) || '2.00'}</div>`;
    }
    
    item.innerHTML = `
        <div class="flex items-center space-x-3">
            <div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <i class="fas fa-user text-purple-600"></i>
            </div>
            <div>
                <div class="font-semibold">${referral.referredName || 'New User'}</div>
                <div class="text-sm text-gray-600">${formattedDate} • ${statusBadge}</div>
            </div>
        </div>
        ${amountText}
    `;
    
    return item;
}

// Setup share buttons
function setupShareButtons() {
    // Copy code button
    document.getElementById('copyCode').addEventListener('click', () => {
        copyToClipboard(referralCode);
        showToast('Referral code copied!');
    });
    
    // Copy link button
    document.getElementById('copyLink').addEventListener('click', () => {
        copyToClipboard(referralLink);
        showToast('Referral link copied!');
    });
    
    // Share buttons
    document.querySelectorAll('.share-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const app = e.currentTarget.getAttribute('data-app');
            shareReferral(app);
        });
    });
}

// Copy to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        console.log('Copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    });
}

// Share referral
function shareReferral(app) {
    const shareText = `Join EARNZY and start earning real money! Use my referral code: ${referralCode} or click: ${referralLink}`;
    
    switch(app) {
        case 'whatsapp':
            window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
            break;
        case 'telegram':
            window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join EARNZY using my code: ' + referralCode)}`, '_blank');
            break;
        case 'sms':
            window.open(`sms:?body=${encodeURIComponent(shareText)}`, '_blank');
            break;
        case 'other':
            if (navigator.share) {
                navigator.share({
                    title: 'Join EARNZY',
                    text: `Use my referral code: ${referralCode}`,
                    url: referralLink
                });
            } else {
                copyToClipboard(shareText);
                showToast('Share text copied!');
            }
            break;
    }
}

// Show toast message
function showToast(message) {
    const toast = document.getElementById('successToast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
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
