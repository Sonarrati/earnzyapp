import { auth, db } from './firebase-init.js';
import { 
    doc, 
    getDoc, 
    updateDoc, 
    arrayUnion,
    collection,
    getDocs,
    query,
    where,
    serverTimestamp,
    increment 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentUser = null;
let currentTask = null;
let taskTimer = null;

// Initialize tasks page
document.addEventListener('DOMContentLoaded', async () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            await loadTasks();
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
            document.getElementById('tasksCompleted').textContent = userData.tasksCompletedToday || 0;
            document.getElementById('todayEarnings').textContent = userData.todayEarnings?.toFixed(2) || '0.00';
            
            // Update progress
            const completed = userData.tasksCompletedToday || 0;
            const progress = (completed / 10) * 100;
            document.getElementById('progressBar').style.width = `${progress}%`;
            document.getElementById('progressCount').textContent = completed;
            
            // Bonus progress
            const bonusProgress = completed >= 3 ? '3/3' : `${completed}/3`;
            document.getElementById('bonusProgress').textContent = bonusProgress;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Load available tasks
async function loadTasks() {
    try {
        const tasksQuery = query(collection(db, 'tasks'), where('status', '==', 'active'));
        const querySnapshot = await getDocs(tasksQuery);
        const tasksList = document.getElementById('tasksList');
        
        tasksList.innerHTML = '';
        
        if (querySnapshot.empty) {
            tasksList.innerHTML = `
                <div class="text-center py-8">
                    <div class="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-tasks text-gray-400 text-2xl"></i>
                    </div>
                    <p class="text-gray-500">No tasks available at the moment</p>
                    <p class="text-gray-400 text-sm mt-2">Check back later for new tasks</p>
                </div>
            `;
            return;
        }
        
        querySnapshot.forEach((doc) => {
            const task = doc.data();
            const taskCard = createTaskCard(task, doc.id);
            tasksList.appendChild(taskCard);
        });
        
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

// Create task card HTML
function createTaskCard(task, taskId) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl p-4 shadow-lg border border-gray-100 task-card';
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div class="flex-1">
                <h3 class="font-semibold text-gray-800">${task.title}</h3>
                <p class="text-gray-600 text-sm mt-1">${task.description}</p>
            </div>
            <div class="text-right">
                <div class="text-green-600 font-bold">₹${task.reward}</div>
                <div class="text-gray-500 text-xs">${task.timeRequired || '30s'}</div>
            </div>
        </div>
        
        <div class="flex justify-between items-center">
            <div class="flex items-center text-sm text-gray-500">
                <i class="fas fa-users mr-1"></i>
                <span>${task.completedCount || 0} completed</span>
            </div>
            <button class="task-start-btn bg-green-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-green-600 transition duration-300" data-task-id="${taskId}">
                Start
            </button>
        </div>
    `;
    
    return card;
}

// Task modal functionality
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('task-start-btn')) {
        const taskId = e.target.getAttribute('data-task-id');
        openTaskModal(taskId);
    }
});

// Open task modal
async function openTaskModal(taskId) {
    try {
        const taskDoc = await getDoc(doc(db, 'tasks', taskId));
        if (!taskDoc.exists()) return;
        
        currentTask = { id: taskId, ...taskDoc.data() };
        
        // Update modal content
        document.getElementById('modalTaskTitle').textContent = currentTask.title;
        document.getElementById('modalTaskReward').textContent = `₹${currentTask.reward}`;
        document.getElementById('modalTaskTime').textContent = `${currentTask.timeRequired || 30} seconds`;
        document.getElementById('modalTaskDescription').textContent = currentTask.description;
        
        // Show instructions if available
        const instructionsDiv = document.getElementById('modalTaskInstructions');
        if (currentTask.instructions) {
            instructionsDiv.innerHTML = `<strong>Instructions:</strong><br>${currentTask.instructions}`;
            instructionsDiv.classList.remove('hidden');
        } else {
            instructionsDiv.classList.add('hidden');
        }
        
        // Show modal
        document.getElementById('taskModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error opening task modal:', error);
    }
}

// Close modal
document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('taskModal').classList.add('hidden');
});

// Start task
document.getElementById('startTask').addEventListener('click', () => {
    if (!currentTask) return;
    
    // Close task modal
    document.getElementById('taskModal').classList.add('hidden');
    
    // Show timer modal
    document.getElementById('timerTaskTitle').textContent = currentTask.title;
    document.getElementById('timerModal').classList.remove('hidden');
    
    // Start countdown
    startTaskTimer(currentTask.timeRequired || 30);
});

// Start task timer
function startTaskTimer(seconds) {
    let timeLeft = seconds;
    const timerCount = document.getElementById('timerCount');
    const timerCircle = document.getElementById('timerCircle');
    
    timerCount.textContent = timeLeft;
    
    taskTimer = setInterval(() => {
        timeLeft--;
        timerCount.textContent = timeLeft;
        
        // Update progress circle (simplified)
        const progress = (timeLeft / seconds) * 100;
        timerCircle.style.background = `conic-gradient(#16a34a ${progress}%, #e5e7eb ${progress}%)`;
        
        if (timeLeft <= 0) {
            clearInterval(taskTimer);
            completeTask();
        }
    }, 1000);
}

// Complete task
async function completeTask() {
    if (!currentTask || !currentUser) return;
    
    try {
        // Hide timer modal
        document.getElementById('timerModal').classList.add('hidden');
        
        // Calculate reward based on subscription plan
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        const planMultiplier = getPlanMultiplier(userData.subscription?.planId);
        const finalReward = currentTask.reward * planMultiplier;
        
        // Update user balance and task count
        await updateDoc(doc(db, 'users', currentUser.uid), {
            balance: increment(finalReward),
            totalEarned: increment(finalReward),
            todayEarnings: increment(finalReward),
            tasksCompletedToday: increment(1),
            lastTaskCompletedAt: serverTimestamp()
        });
        
        // Create transaction record
        await updateDoc(doc(db, 'transactions', currentUser.uid + '_' + Date.now()), {
            userId: currentUser.uid,
            amount: finalReward,
            type: 'credit',
            description: `Task: ${currentTask.title}`,
            taskId: currentTask.id,
            createdAt: serverTimestamp()
        });
        
        // Update task completion count
        await updateDoc(doc(db, 'tasks', currentTask.id), {
            completedCount: increment(1),
            lastCompletedAt: serverTimestamp()
        });
        
        // Show success message
        showSuccessMessage(`Task completed! ₹${finalReward.toFixed(2)} added to your balance.`);
        
        // Reload data
        await loadUserData();
        await loadTasks();
        
        // Check for treasure box unlock
        checkTreasureUnlock();
        
    } catch (error) {
        console.error('Error completing task:', error);
        showErrorMessage('Error completing task. Please try again.');
    }
}

// Get plan multiplier for tasks
function getPlanMultiplier(planId) {
    const multipliers = {
        'free': 1.0,
        'silver': 1.2,
        'gold': 1.3,
        'platinum': 1.5
    };
    return multipliers[planId] || 1.0;
}

// Check if treasure box should be unlocked
async function checkTreasureUnlock() {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data();
    
    if (userData.tasksCompletedToday >= 3) {
        // Unlock treasure box
        await updateDoc(doc(db, 'users', currentUser.uid), {
            treasureUnlocked: true
        });
        
        showSuccessMessage('🎉 Treasure Box unlocked! Complete 2 more tasks or watch 5 ads to open it.');
    }
}

// Cancel task
document.getElementById('cancelTask').addEventListener('click', () => {
    clearInterval(taskTimer);
    document.getElementById('timerModal').classList.add('hidden');
    currentTask = null;
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
