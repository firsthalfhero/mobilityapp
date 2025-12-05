import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, orderBy, limit, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        
        // setLogLevel('Debug'); // Enable debug logging for Firestore

        let db;
        let auth;
        let userId = null;
        
        // --- Setup Variables for Local Development ---
        // The firebaseConfig object is now loaded from js/config.js
        
        // For local testing, we will ignore the token and app ID from the canvas.
        const initialAuthToken = null; 
        // ------------------------------------

        // --- Utility Functions ---

        /**
         * Generates the correct Firestore path for the user's private data.
         * For local development, this is simplified.
         * @param {string} collectionName - The name of the collection (e.g., 'exercises' or 'logs').
         * @returns {string} The full Firestore path.
         */
        function getPrivateCollectionPath(collectionName) {
            if (!userId) {
                console.error("Attempted to access Firestore before user is authenticated.");
                return null;
            }
            // Simplified path for local development: /users/{userId}/{collectionName}
            return `users/${userId}/${collectionName}`;
        }

        // --- App State and Logic ---

        let exercises = [];
        let sessionLogs = [];
        let currentExerciseId = null;

        // --- Dashboard Logic ---

        function getStartOfWeek() {
            const now = new Date();
            const day = now.getDay(); // 0 (Sun) to 6 (Sat)
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
            const monday = new Date(now);
            monday.setDate(diff);
            monday.setHours(0, 0, 0, 0);
            return monday;
        }

        function renderWeeklyActivity() {
            const container = document.getElementById('weekly-activity-content');
            if (!container) return;

            const startOfWeek = getStartOfWeek();
            const weeklyLogs = sessionLogs.filter(log => log.Date.toDate() >= startOfWeek);

            if (weeklyLogs.length === 0) {
                container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic text-center">New week, let\'s hit the gym!</p>';
                return;
            }

            // Summarize: Group by day
            const activityByDay = {};
            // Sort logs by date ascending for the summary
            weeklyLogs.sort((a, b) => a.Date.toDate() - b.Date.toDate());

            weeklyLogs.forEach(log => {
                const date = log.Date.toDate().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                if (!activityByDay[date]) activityByDay[date] = 0;
                activityByDay[date]++; // Count sets
            });

            let html = '<ul class="space-y-2">';
            for (const [day, count] of Object.entries(activityByDay)) {
                html += `
                    <li onclick="switchTab('history-tab')" class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-600 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors">
                        <span class="font-medium text-gray-700 dark:text-gray-200">${day}</span>
                        <span class="text-sm text-cyan-600 dark:text-cyan-400 font-bold">${count} Sets Logged</span>
                    </li>
                `;
            }
            html += '</ul>';
            container.innerHTML = html;
        }

        /**
         * Renders the list of exercises in the My Program tab.
         */
        function renderExercises() {
            const container = document.getElementById('exercise-list');
            if (!container) return;

            container.innerHTML = '';
            
            if (exercises.length === 0) {
                container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center mt-8">No exercises added yet.</p>';
                return;
            }

            // Render flat list
            exercises.forEach((exercise, index) => {
                const card = document.createElement('div');
                // Added cursor-move to indicate draggable
                card.className = `card bg-white dark:bg-gray-700 p-4 rounded-xl shadow-lg border-l-4 border-cyan-500 dark:border-cyan-400 mb-4 cursor-move`; 
                card.setAttribute('data-id', exercise.Exercise_ID);
                
                card.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex-grow" onclick="handleEditExercise('${exercise.Exercise_ID}')">
                            <div class="flex justify-between items-start mb-1">
                                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">${exercise.Name}</h3>
                                <span class="bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-[10px] px-2 py-0.5 rounded-md font-medium uppercase tracking-wider mr-2 text-center min-w-[60px]">${exercise.Focus_Area || 'General'}</span>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">${exercise.Physio_Notes || 'No notes available.'}</p>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });

            // Initialize Sortable
            if (window.sortableInstance) window.sortableInstance.destroy();
            window.sortableInstance = new Sortable(container, {
                animation: 150,
                handle: '.card', // Draggable by the whole card
                delay: 100, // Slight delay to prevent accidental drags when tapping to edit
                onEnd: async function (evt) {
                    const newIndex = evt.newIndex;
                    const oldIndex = evt.oldIndex;
                    
                    if (newIndex === oldIndex) return;

                    // Reorder local array
                    const movedItem = exercises.splice(oldIndex, 1)[0];
                    exercises.splice(newIndex, 0, movedItem);

                    // Batch update Firestore
                    try {
                        const batch = writeBatch(db);
                        const exercisesPath = getPrivateCollectionPath('exercises');
                        
                        exercises.forEach((ex, index) => {
                            const ref = doc(db, exercisesPath, ex.Exercise_ID);
                            batch.update(ref, { order: index }); // Simple sequential ordering
                        });
                        
                        await batch.commit();
                    } catch (error) {
                        console.error("Error saving order:", error);
                        showMessage("Failed to save new order.", "error");
                    }
                }
            });
        }
        
        /**
         * Global handler to open edit form from HTML onclick
         * @param {string} exerciseId 
         */
        function handleEditExercise(exerciseId) {
            const exercise = exercises.find(e => e.Exercise_ID === exerciseId);
            if (exercise) {
                openAddExerciseForm(exercise);
            }
        }
        window.handleEditExercise = handleEditExercise;

        /**
         * Renders the last 5 logs for the current exercise.
         * @param {string} exerciseId - The ID of the exercise.
         */
        function renderRelatedLogs(exerciseId) {
            const logsContainer = document.getElementById('detail-log-history');
            if (!logsContainer) return;

            const relatedLogs = sessionLogs
                .filter(log => log.Exercise_ID === exerciseId)
                .sort((a, b) => b.Date.toDate() - a.Date.toDate());

            if (relatedLogs.length === 0) {
                logsContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400">No session history logged yet.</p>';
                return;
            }

            // Group logs by workout session
            const sessions = relatedLogs.reduce((acc, log) => {
                const sessionTime = log.Date.toDate().getTime();
                if (!acc[sessionTime]) {
                    acc[sessionTime] = { date: log.Date.toDate(), logs: [] };
                }
                acc[sessionTime].logs.push(log);
                return acc;
            }, {});

            const last5Sessions = Object.values(sessions).slice(0, 5);

            logsContainer.innerHTML = last5Sessions.map(session => {
                 const dateStr = session.date.toLocaleDateString();
                 const timeStr = session.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                 const sets = session.logs.sort((a, b) => a.SetNumber - b.SetNumber);

                 return `
                    <div class="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg border border-gray-200 dark:border-gray-600 mb-3">
                        <div class="flex justify-between text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                            <span>${dateStr} @ ${timeStr}</span>
                        </div>
                        <ul class="text-sm text-gray-600 dark:text-gray-300 space-y-1 pl-1">
                        ${sets.map(set => `
                            <li class="flex justify-between">
                                <span>
                                    <strong>Set ${set.SetNumber}:</strong> ${set.Actual_Reps}
                                    <span class="text-gray-500 dark:text-gray-400">@ ${set.Weight_Used || '0'}</span>
                                    ${set.Variation ? `<span class="text-cyan-600 dark:text-cyan-400">(${set.Variation})</span>` : ''}
                                </span>
                                <span class="text-red-500 dark:text-red-400">Pain: ${set.Pain_Level}</span>
                            </li>
                        `).join('')}
                        </ul>
                    </div>
                 `;
            }).join('');
        }

        /**
         * Switches the main view tab.
         * @param {string} tabId - The ID of the tab content to show.
         */
        function switchTab(tabId) {
            // Hide all tab content
            document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
            // Show the selected tab content
            const activeContent = document.getElementById(tabId);
            if (activeContent) activeContent.style.display = 'block';

            // Update active tab styles
            document.querySelectorAll('.tab-header button').forEach(button => {
                button.classList.remove('active-tab');
            });
            const activeHeader = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
            if (activeHeader) activeHeader.classList.add('active-tab');
        }
        
        // Expose function globally for HTML elements
        window.switchTab = switchTab;

        /**
         * Populates the Log Form with the selected exercise details and switches view.
         */
        function openLogForm() {
            if (!currentExerciseId) {
                showMessage("Please select an exercise first.", 'error');
                return;
            }
            const exercise = exercises.find(e => e.Exercise_ID === currentExerciseId);
            if (!exercise) return;

            document.getElementById('log-exercise-name').textContent = exercise.Name;
            document.getElementById('log-form').reset();
            
            // Set initial defaults/hints based on the master exercise
            document.getElementById('log-actual-sets').placeholder = `Target: ${exercise.Target_Sets}`;
            document.getElementById('log-actual-reps').placeholder = `Target: ${exercise.Target_Reps}`;
            document.getElementById('log-weight-used').value = exercise.Weight_Used_Initial || '';
            
            window.switchTab('log-form-tab');
        }
        
        // Expose function globally for HTML elements
        window.openLogForm = openLogForm;

        /**
         * Handles the deletion of the currently viewed exercise and all its logs.
         */
        async function handleDeleteExercise() {
            if (!currentExerciseId) {
                showMessage("No exercise selected.", 'error');
                return;
            }

            const exerciseToDelete = exercises.find(e => e.Exercise_ID === currentExerciseId);
            if (!exerciseToDelete) {
                showMessage("Could not find the exercise to delete.", 'error');
                return;
            }

            if (confirm(`Are you sure you want to permanently delete "${exerciseToDelete.Name}" and all of its logged history? This cannot be undone.`)) {
                try {
                    const batch = writeBatch(db);

                    // 1. Find and delete all related logs
                    const logsPath = getPrivateCollectionPath('logs');
                    const q = query(collection(db, logsPath), where("Exercise_ID", "==", currentExerciseId));
                    const logsSnapshot = await getDocs(q);
                    logsSnapshot.forEach(logDoc => {
                        batch.delete(logDoc.ref);
                    });

                    // 2. Delete the main exercise document
                    const exerciseDocRef = doc(db, getPrivateCollectionPath('exercises'), currentExerciseId);
                    batch.delete(exerciseDocRef);

                    // 3. Commit the batch
                    await batch.commit();

                    showMessage(`"${exerciseToDelete.Name}" was deleted.`, 'success');
                    window.switchTab('my-program');

                } catch (error) {
                    console.error("Error deleting exercise: ", error);
                    showMessage("Failed to delete exercise. Check console.", 'error');
                }
            }
        }
        // Expose globally
        window.handleDeleteExercise = handleDeleteExercise;

        /**
         * Handles the submission of the workout log form.
         * @param {Event} event - The form submit event.
         */
        async function handleLogSubmission(event) {
            event.preventDefault();
            
            if (!userId) {
                showMessage("App not fully authenticated. Please wait a moment and try again.", 'error');
                return;
            }
            if (!currentExerciseId) {
                 showMessage("Error: No exercise selected.", 'error');
                 return;
            }

            const form = event.target;
            const logData = {
                Exercise_ID: currentExerciseId,
                Date: new Date(),
                Variation: form['Variation'].value.trim(), // Add variation
                Actual_Sets: parseInt(form['Actual_Sets'].value, 10),
                Actual_Reps: form['Actual_Reps'].value.trim(),
                Weight_Used: form['Weight_Used'].value.trim(),
                Subjective_Feeling: parseInt(form['Subjective_Feeling'].value, 10),
                Pain_Level: parseInt(form['Pain_Level'].value, 10),
                Comments: form['Comments'].value.trim(),
            };
            
            if (isNaN(logData.Actual_Sets) || logData.Actual_Sets <= 0) {
                showMessage("Please enter a valid number of sets.", 'error');
                return;
            }
            if (!logData.Actual_Reps) {
                showMessage("Please enter the reps/duration performed.", 'error');
                return;
            }

            try {
                const logsCollectionRef = collection(db, getPrivateCollectionPath('logs'));
                await addDoc(logsCollectionRef, logData);

                showMessage("Workout logged successfully!", 'success');
                form.reset();
                // After logging, switch back to the main program view (which will refresh logs)
                window.switchTab('my-program'); 
            } catch (error) {
                console.error("Error writing document: ", error);
                showMessage("Failed to log workout. Check console for details.", 'error');
            }
        }

        /**
         * Displays a temporary message box to the user.
         * @param {string} message - The message content.
         * @param {string} type - 'success' or 'error'.
         */
        function showMessage(message, type) {
            const box = document.getElementById('message-box');
            box.textContent = message;
            box.className = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 p-3 rounded-xl shadow-2xl z-50 transition-all duration-300';
            
            if (type === 'success') {
                box.classList.add('bg-green-500', 'text-white');
            } else if (type === 'error') {
                box.classList.add('bg-red-500', 'text-white');
            }
            
            box.style.opacity = '1';

            setTimeout(() => {
                box.style.opacity = '0';
            }, 3000);
        }

        /**
         * Switches view to the Add/Edit Exercise form.
         */
        function openAddExerciseForm(exerciseToEdit = null) {
            const form = document.getElementById('add-exercise-form');
            const title = document.querySelector('#add-exercise-tab h2');
            const submitBtn = form.querySelector('button[type="submit"]');

            form.reset();
            
            if (exerciseToEdit) {
                // Edit Mode
                currentExerciseId = exerciseToEdit.Exercise_ID; // Track ID for deletion/updates
                form.setAttribute('data-edit-id', exerciseToEdit.Exercise_ID);
                title.textContent = "Edit Exercise";
                submitBtn.textContent = "Update Exercise";

                // Populate fields
                form['Name'].value = exerciseToEdit.Name || '';
                form['Focus_Area'].value = exerciseToEdit.Focus_Area || '';
                form['Target_Sets'].value = exerciseToEdit.Target_Sets || '';
                form['Target_Reps'].value = exerciseToEdit.Target_Reps || '';
                form['Weight_Used_Initial'].value = exerciseToEdit.Weight_Used_Initial || '';
                form['Video_Link'].value = exerciseToEdit.Video_Link || '';
                form['Physio_Notes'].value = exerciseToEdit.Physio_Notes || '';
                
                // Add Delete Button dynamically if editing
                if (!document.getElementById('delete-exercise-btn')) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.id = 'delete-exercise-btn';
                    deleteBtn.type = 'button';
                    deleteBtn.className = 'w-full mt-4 bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800 font-bold py-3 rounded-xl transition-colors';
                    deleteBtn.textContent = 'Delete Exercise';
                    deleteBtn.onclick = handleDeleteExercise; // Reuse existing delete handler
                    form.appendChild(deleteBtn);
                }
            } else {
                // Add Mode
                currentExerciseId = null;
                form.removeAttribute('data-edit-id');
                title.textContent = "Create New Exercise";
                submitBtn.textContent = "Save Exercise";
                
                // Remove delete button if present
                const deleteBtn = document.getElementById('delete-exercise-btn');
                if (deleteBtn) deleteBtn.remove();
            }

            window.switchTab('add-exercise-tab');
        }
        // Expose globally
        window.openAddExerciseForm = openAddExerciseForm;

        // ...

        /**
         * Handles the submission of the new exercise form.
         * @param {Event} event - The form submit event.
         */
        async function handleAddExerciseSubmission(event) {
            event.preventDefault();
            
            if (!userId) {
                showMessage("Authentication error. Please reload.", 'error');
                return;
            }

            const form = event.target;
            const editId = form.getAttribute('data-edit-id');

            const exerciseData = {
                Name: form['Name'].value.trim(),
                Focus_Area: form['Focus_Area'].value.trim(),
                Target_Sets: parseInt(form['Target_Sets'].value, 10),
                Target_Reps: form['Target_Reps'].value.trim(),
                Weight_Used_Initial: form['Weight_Used_Initial'].value.trim(),
                Video_Link: form['Video_Link'].value.trim(),
                Physio_Notes: form['Physio_Notes'].value.trim(),
            };
            
            // Only set order for new items to avoid overwriting existing order on edit
            if (!editId) {
                exerciseData.order = new Date().getTime(); 
            }

            if (!exerciseData.Name || !exerciseData.Focus_Area) {
                showMessage("Exercise Name and Focus Area are required.", 'error');
                return;
            }
            if (isNaN(exerciseData.Target_Sets) || exerciseData.Target_Sets <= 0) {
                showMessage("Please enter valid Target Sets.", 'error');
                return;
            }

            try {
                const exercisesPath = getPrivateCollectionPath('exercises');
                
                if (editId) {
                    // Update existing
                    const docRef = doc(db, exercisesPath, editId);
                    await updateDoc(docRef, exerciseData);
                    showMessage("Exercise updated successfully!", 'success');
                } else {
                    // Create new
                    const collectionRef = collection(db, exercisesPath);
                    await addDoc(collectionRef, exerciseData);
                    showMessage("Exercise added successfully!", 'success');
                }

                form.reset();
                window.switchTab('my-program'); 
            } catch (error) {
                console.error("Error saving exercise: ", error);
                showMessage("Failed to save exercise. Check console.", 'error');
            }
        }

        // --- Firebase Authentication and Initialization ---

        /**
         * Initiates the Google Sign-In popup flow.
         */
        function signInWithGoogle() {
            const provider = new GoogleAuthProvider();
            signInWithPopup(auth, provider)
                .then((result) => {
                    // This will trigger the onAuthStateChanged listener
                    console.log("Sign-in successful for:", result.user.displayName);
                }).catch((error) => {
                    console.error("Google Sign-In Error:", error);
                    showMessage(`Sign-in failed: ${error.message}`, 'error');
                });
        }
        window.signInWithGoogle = signInWithGoogle;

        /**
         * Signs the current user out.
         */
        function signOutUser() {
            if (confirm("Are you sure you want to sign out?")) {
                signOut(auth).catch((error) => {
                    console.error("Sign-Out Error:", error);
                    showMessage(`Sign-out failed: ${error.message}`, 'error');
                });
            }
        }
        window.signOutUser = signOutUser;

        async function initializeFirebase() {
            // --- New check for valid Firebase config ---
            if (!firebaseConfig || !firebaseConfig.apiKey) {
                document.getElementById('sign-in-view').innerHTML = '<p class="text-red-500">Firebase configuration is missing. App cannot start.</p>';
                document.getElementById('sign-in-view').style.display = 'flex';
                document.getElementById('loading-overlay').style.display = 'none';
                return;
            }
            // --- End of new check ---

            try {
                const app = initializeApp(firebaseConfig);
                db = getFirestore(app);
                auth = getAuth(app);

                onAuthStateChanged(auth, async (user) => {
                    const signInView = document.getElementById('sign-in-view');
                    const mainAppContainer = document.getElementById('main-app-container');
                    const signOutBtn = document.getElementById('sign-out-btn');
                    const loadingOverlay = document.getElementById('loading-overlay');

                    if (user) {
                        // User is signed in
                        userId = user.uid;
                        console.log("Firebase Auth successful. User ID:", userId);
                        
                        signInView.style.display = 'none';
                        mainAppContainer.style.display = 'block';
                        signOutBtn.style.display = 'block';
                        loadingOverlay.style.display = 'flex';
                        document.getElementById('loading-message').textContent = `Welcome, ${user.displayName || 'user'}! Loading data...`;

                        setupRealtimeListeners();
                    } else {
                        // User is signed out
                        userId = null;
                        console.log("No user signed in.");

                        // Reset app state
                        exercises = [];
                        sessionLogs = [];
                        renderExercises(); // Clear lists
                        renderHistoryChart();

                        loadingOverlay.style.display = 'none';
                        mainAppContainer.style.display = 'none';
                        signOutBtn.style.display = 'none';
                        signInView.style.display = 'flex';
                    }
                });

            } catch (error) {
                console.error("Firebase Initialization Error:", error);
                document.getElementById('loading-message').textContent = `Init failed: ${error.message}.`;
            }
        }

        /**
         * Sets up real-time listeners for the two main data collections.
         */
        function setupRealtimeListeners() {
            if (!userId || !db) return;

            // 1. Listen for Exercise changes (Master Library)
            const exercisesPath = getPrivateCollectionPath('exercises');
            if (exercisesPath) {
                const q = query(collection(db, exercisesPath), orderBy("order", "asc"));
                onSnapshot(q, (snapshot) => {
                    exercises = snapshot.docs.map(doc => ({ Exercise_ID: doc.id, ...doc.data() }));
                    renderExercises();
                    renderWorkoutForm(); // Render the new workout form
                    
                    // If loading overlay is visible, this is likely the initial load
                    const overlay = document.getElementById('loading-overlay');
                    if (overlay && overlay.style.display !== 'none') {
                        overlay.style.display = 'none';
                        document.getElementById('loading-message').textContent = ''; // Clear loading text
                        window.switchTab('dashboard-tab'); 
                    }
                }, (error) => {
                    console.error("Error fetching exercises:", error);
                    showMessage("Failed to load exercise list.", 'error');
                });
            }

            // 2. Listen for Session Log changes (Tracking History)
            const logsPath = getPrivateCollectionPath('logs');
            if (logsPath) {
                onSnapshot(collection(db, logsPath), (snapshot) => {
                    // Convert Firestore Timestamps to JS Date objects on load for sorting
                    sessionLogs = snapshot.docs.map(doc => ({ Log_ID: doc.id, ...doc.data() }));
                    // If we are in the detail view, refresh the log history
                    if (currentExerciseId) {
                         renderRelatedLogs(currentExerciseId);
                    }
                    // Re-render the overall history chart
                    renderHistoryChart();
                    // Re-render weekly activity
                    renderWeeklyActivity();
                }, (error) => {
                    console.error("Error fetching session logs:", error);
                    showMessage("Failed to load session history.", 'error');
                });
            }
            
            // Default to Dashboard
            window.switchTab('dashboard-tab');
        }

        function addSet(exerciseId) {
            event.preventDefault();
            const container = document.getElementById(`sets-container_${exerciseId}`);
            if (!container) return;

            const setCount = container.children.length + 1;
            const newSetHtml = `
                <div class="flex items-center space-x-2 set-row">
                    <span class="text-sm font-medium text-gray-500 dark:text-gray-400 w-10">Set ${setCount}</span>
                    <input type="text" name="reps_${exerciseId}" class="block w-full rounded-md bg-gray-50 dark:bg-gray-600 border-gray-300 dark:border-gray-500 dark:text-gray-200 shadow-sm p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500" placeholder="Reps">
                    <input type="text" name="weight_${exerciseId}" class="block w-full rounded-md bg-gray-50 dark:bg-gray-600 border-gray-300 dark:border-gray-500 dark:text-gray-200 shadow-sm p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500" placeholder="Weight">
                    <input type="text" name="var_${exerciseId}" class="block w-full rounded-md bg-gray-50 dark:bg-gray-600 border-gray-300 dark:border-gray-500 dark:text-gray-200 shadow-sm p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500" placeholder="Variation">
                    <input type="number" name="pain_${exerciseId}" min="0" max="10" value="0" class="block w-20 rounded-md bg-gray-50 dark:bg-gray-600 border-gray-300 dark:border-gray-500 dark:text-gray-200 shadow-sm p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500" title="Pain (0-10)">
                    <button type="button" onclick="removeSet(this)" class="p-2 text-red-500 hover:text-red-700 flex-shrink-0 text-xl leading-none">&times;</button>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', newSetHtml);
        }
        window.addSet = addSet;

        function removeSet(button) {
            event.preventDefault();
            button.closest('.set-row').remove();
        }
        window.removeSet = removeSet;

        function renderWorkoutForm() {
            const container = document.getElementById('log-workout-tab');
            if (!container) return;

            const groupedExercises = exercises.reduce((acc, exercise) => {
                const area = exercise.Focus_Area || 'Uncategorized';
                if (!acc[area]) acc[area] = [];
                acc[area].push(exercise);
                return acc;
            }, {});

            let formHtml = `
                <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">Log Daily Workout</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">For each exercise, add and fill in the sets you completed. Only sets with 'Reps' filled in will be saved.</p>
                <form id="log-workout-form">
            `;

            for (const area in groupedExercises) {
                formHtml += `<h3 class="text-lg font-bold text-gray-700 dark:text-gray-300 mt-6 mb-3 border-b dark:border-gray-600 pb-1">${area}</h3>`;
                
                groupedExercises[area].forEach(exercise => {
                    const exId = exercise.Exercise_ID;
                    formHtml += `
                        <div class="bg-white dark:bg-gray-700 p-4 rounded-xl shadow-md mb-4 border-l-4 border-gray-200 dark:border-gray-600">
                            <p class="font-bold text-gray-800 dark:text-gray-100 text-lg">${exercise.Name}</p>
                            <div id="sets-container_${exId}" class="space-y-3 mt-3">
                                <!-- Set 1 (Default) -->
                                <div class="flex items-center space-x-2 set-row">
                                    <span class="text-sm font-medium text-gray-500 dark:text-gray-400 w-10">Set 1</span>
                                    <input type="text" name="reps_${exId}" class="block w-full rounded-md bg-gray-50 dark:bg-gray-600 border-gray-300 dark:border-gray-500 dark:text-gray-200 shadow-sm p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500" placeholder="Reps">
                                    <input type="text" name="weight_${exId}" class="block w-full rounded-md bg-gray-50 dark:bg-gray-600 border-gray-300 dark:border-gray-500 dark:text-gray-200 shadow-sm p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500" placeholder="Weight">
                                    <input type="text" name="var_${exId}" class="block w-full rounded-md bg-gray-50 dark:bg-gray-600 border-gray-300 dark:border-gray-500 dark:text-gray-200 shadow-sm p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500" placeholder="Variation">
                                    <input type="number" name="pain_${exId}" min="0" max="10" value="0" class="block w-20 rounded-md bg-gray-50 dark:bg-gray-600 border-gray-300 dark:border-gray-500 dark:text-gray-200 shadow-sm p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500" title="Pain (0-10)">
                                    <div class="w-8"></div> <!-- Spacer for alignment with remove button -->
                                </div>
                            </div>
                            <button type="button" onclick="addSet('${exId}')" class="text-sm text-cyan-600 dark:text-cyan-400 hover:underline mt-3 font-medium">+ Add Set</button>
                        </div>
                    `;
                });
            }

            formHtml += `
                    <button type="submit" class="w-full mt-6 bg-green-500 hover:bg-green-600 text-white text-lg font-bold py-3 rounded-xl shadow-lg">
                        Save Workout
                    </button>
                </form>
            `;
            container.innerHTML = formHtml;
            
            const workoutForm = document.getElementById('log-workout-form');
            if(workoutForm) {
                workoutForm.addEventListener('submit', handleWorkoutSubmission);
            }
        }

        async function handleWorkoutSubmission(event) {
            event.preventDefault();
            if (!userId) {
                showMessage("Authentication error. Please reload.", 'error');
                return;
            }

            const form = event.target;
            const batch = writeBatch(db);
            const logsCollectionRef = collection(db, getPrivateCollectionPath('logs'));
            let logsAttempted = 0;
            const workoutDate = new Date();

            exercises.forEach(exercise => {
                const exId = exercise.Exercise_ID;
                const setsContainer = document.getElementById(`sets-container_${exId}`);
                if (!setsContainer) return;

                const setRows = setsContainer.querySelectorAll('.set-row');
                setRows.forEach((row, index) => {
                    const repsInput = row.querySelector(`input[name="reps_${exId}"]`);
                    const reps = repsInput ? repsInput.value.trim() : '';

                    if (reps) {
                        logsAttempted++;
                        const newLogRef = doc(logsCollectionRef);
                        
                        const logData = {
                            Exercise_ID: exId,
                            Date: workoutDate,
                            SetNumber: index + 1,
                            Actual_Reps: reps,
                            Weight_Used: row.querySelector(`input[name="weight_${exId}"]`).value.trim(),
                            Variation: row.querySelector(`input[name="var_${exId}"]`).value.trim(),
                            Pain_Level: parseInt(row.querySelector(`input[name="pain_${exId}"]`).value, 10) || 0,
                            Subjective_Feeling: 3,
                            Comments: ''
                        };
                        batch.set(newLogRef, logData);
                    }
                });
            });

            if (logsAttempted === 0) {
                showMessage("No sets were logged. Please enter the reps for at least one set.", 'error');
                return;
            }

            try {
                await batch.commit();
                showMessage(`${logsAttempted} set(s) logged successfully!`, 'success');
                // Don't reset the form, just switch tabs
                window.switchTab('history-tab');
            } catch (error) {
                console.error("Error writing batch: ", error);
                showMessage("Failed to save workout. Check console.", 'error');
            }
        }

        /**
         * Renders the simplified History Chart (just a list for simplicity in this single file PWA).
         */
        function renderHistoryChart() {
            const container = document.getElementById('history-list');
            if (!container) return;

            if (sessionLogs.length === 0) {
                 container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center mt-8">No history logged yet. Log your first workout!</p>';
                 return;
            }

            const exerciseMap = new Map(exercises.map(e => [e.Exercise_ID, e.Name]));

            // Group logs by workout session (a session is all logs with the same timestamp)
            const sessions = sessionLogs.reduce((acc, log) => {
                const sessionTime = log.Date.toDate().getTime();
                if (!acc[sessionTime]) {
                    acc[sessionTime] = { date: log.Date.toDate(), logs: [] };
                }
                acc[sessionTime].logs.push(log);
                return acc;
            }, {});

            // Sort sessions by date, newest first
            const sortedSessions = Object.values(sessions).sort((a, b) => b.date - a.date);

            container.innerHTML = sortedSessions.map(session => {
                const dateStr = session.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                const timeStr = session.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // Group logs within the session by exercise
                const exercisesInSession = session.logs.reduce((acc, log) => {
                    const exerciseName = exerciseMap.get(log.Exercise_ID) || 'Unknown Exercise';
                    if (!acc[exerciseName]) {
                        acc[exerciseName] = [];
                    }
                    acc[exerciseName].push(log);
                    return acc;
                }, {});

                let exerciseHtml = '';
                for (const exName in exercisesInSession) {
                    const sets = exercisesInSession[exName].sort((a, b) => a.SetNumber - b.SetNumber);
                    exerciseHtml += `
                        <div class="mt-3">
                            <h4 class="font-bold text-gray-700 dark:text-gray-200">${exName}</h4>
                            <ul class="text-sm text-gray-600 dark:text-gray-300 mt-1 space-y-1 pl-2">
                                ${sets.map(set => `
                                    <li class="flex justify-between">
                                        <span>
                                            <strong>Set ${set.SetNumber}:</strong> ${set.Actual_Reps}
                                            <span class="text-gray-500 dark:text-gray-400">@ ${set.Weight_Used || '0'}</span>
                                            ${set.Variation ? `<span class="text-cyan-600 dark:text-cyan-400">(${set.Variation})</span>` : ''}
                                        </span>
                                        <span class="text-red-500 dark:text-red-400">Pain: ${set.Pain_Level}</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    `;
                }

                return `
                    <div class="bg-white dark:bg-gray-700 p-4 rounded-xl shadow-md border-l-4 border-cyan-500 dark:border-cyan-400 mb-4">
                        <div class="flex justify-between items-center mb-2 border-b dark:border-gray-600 pb-2">
                            <h3 class="font-bold text-gray-800 dark:text-gray-100">${dateStr}</h3>
                            <span class="text-sm text-gray-500 dark:text-gray-400">${timeStr}</span>
                        </div>
                        ${exerciseHtml}
                    </div>
                `;
            }).join('');
        }
        
        // Add event listener for the log form submission
        document.addEventListener('DOMContentLoaded', () => {
             document.getElementById('add-exercise-form').addEventListener('submit', handleAddExerciseSubmission);
             initializeFirebase();
        });