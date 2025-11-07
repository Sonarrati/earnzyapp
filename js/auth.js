import { auth, db } from './firebase-init.js';
import { 
    signInWithPhoneNumber, 
    RecaptchaVerifier,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    getDoc,
    updateDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let confirmationResult;

// Initialize reCAPTCHA
function initializeRecaptcha() {
    window.recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
        'size': 'normal',
        'callback': (response) => {
            console.log('reCAPTCHA solved');
        }
    }, auth);
    
    window.recaptchaVerifier.render();
}

// Send OTP
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const mobileNumber = document.getElementById('mobileNumber').value;
    const fullNumber = '+91' + mobileNumber;
    
    if (!mobileNumber || mobileNumber.length !== 10) {
        alert('Please enter a valid 10-digit mobile number');
        return;
    }
    
    try {
        initializeRecaptcha();
        
        confirmationResult = await signInWithPhoneNumber(
            auth, 
            fullNumber, 
            window.recaptchaVerifier
        );
        
        // Show OTP section
        document.getElementById('mobileSection').classList.add('hidden');
        document.getElementById('otpSection').classList.remove('hidden');
        document.getElementById('mobileButtons').classList.add('hidden');
        document.getElementById('otpButtons').classList.remove('hidden');
        document.getElementById('mobileDisplay').textContent = mobileNumber;
        
        // Start countdown
        startCountdown();
        
    } catch (error) {
        console.error('Error sending OTP:', error);
        alert('Error sending OTP: ' + error.message);
        window.recaptchaVerifier.clear();
    }
});

// Verify OTP
document.getElementById('verifyOtp')?.addEventListener('click', async () => {
    const otpInputs = document.querySelectorAll('#otpSection input[type="text"]');
    const otp = Array.from(otpInputs).map(input => input.value).join('');
    
    if (otp.length !== 6) {
        alert('Please enter the complete 6-digit OTP');
        return;
    }
    
    try {
        const result = await confirmationResult.confirm(otp);
        const user = result.user;
        
        // Check if user is new or existing
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists()) {
            // New user - create document with signup bonus
            await setDoc(doc(db, 'users', user.uid), {
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
                streak: {
                    day: 0,
                    lastCheckinAt: null
                },
                deviceIds: [],
                fraudFlags: {
                    count: 0
                },
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp()
            });
            
            // Create signup bonus transaction
            await setDoc(doc(db, 'transactions', user.uid + '_signup'), {
                userId: user.uid,
                amount: 2.00,
                type: 'credit',
                description: 'Signup Bonus',
                createdAt: serverTimestamp()
            });
        } else {
            // Existing user - update last login
            await updateDoc(doc(db, 'users', user.uid), {
                lastLoginAt: serverTimestamp()
            });
        }
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Error verifying OTP:', error);
        alert('Invalid OTP. Please try again.');
    }
});

// Auth state listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        console.log('User signed in:', user.uid);
        
        // Update UI for signed-in state
        const loginBtn = document.getElementById('loginBtn');
        const userBalance = document.getElementById('userBalance');
        
        if (loginBtn) {
            loginBtn.style.display = 'none';
        }
        
        // Load user data
        loadUserData(user.uid);
        
    } else {
        // User is signed out
        console.log('User signed out');
        
        // Redirect to login if on protected page
        const protectedPages = ['dashboard.html', 'tasks.html', 'profile.html'];
        const currentPage = window.location.pathname.split('/').pop();
        
        if (protectedPages.includes(currentPage)) {
            window.location.href = 'login.html';
        }
    }
});

// Load user data from Firestore
async function loadUserData(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // Update UI elements
            const userBalance = document.getElementById('userBalance');
            const totalEarned = document.getElementById('totalEarned');
            const streakDays = document.getElementById('streakDays');
            const userName = document.getElementById('userName');
            
            if (userBalance) userBalance.textContent = userData.balance?.toFixed(2) || '0.00';
            if (totalEarned) totalEarned.textContent = userData.totalEarned?.toFixed(2) || '0.00';
            if (streakDays) streakDays.textContent = userData.streak?.day || '0';
            if (userName) userName.textContent = userData.name || 'User';
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Logout functionality
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
});

// Export for use in other files
export { auth, db, loadUserData };
