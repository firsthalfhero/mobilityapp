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
                    <li class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-600 rounded-lg">
                        <span class="font-medium text-gray-700 dark:text-gray-200">${day}</span>
                        <span class="text-sm text-cyan-600 dark:text-cyan-400 font-bold">${count} Sets Logged</span>
                    </li>
                `;
            }
            html += '</ul>';
            container.innerHTML = html;
        }

        /**
         * Moves an exercise up or down in the order.
         * @param {string} exerciseId - The ID of the exercise to move.
         * @param {'up' | 'down'} direction - The direction to move.
         */
        async function moveExercise(exerciseId, direction) {
            // Stop the click from propagating to the card's navigation handler
            event.stopPropagation();

            const currentIndex = exercises.findIndex(e => e.Exercise_ID === exerciseId);
            if (currentIndex === -1) return;

            const adjacentIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (adjacentIndex < 0 || adjacentIndex >= exercises.length) return;

            const exerciseToMove = exercises[currentIndex];
            const adjacentExercise = exercises[adjacentIndex];

            // Swap the 'order' values
            const order1 = exerciseToMove.order;
            const order2 = adjacentExercise.order;

            try {
                const batch = writeBatch(db);
                const exercisesPath = getPrivateCollectionPath('exercises');
                
                const ref1 = doc(db, exercisesPath, exerciseToMove.Exercise_ID);
                batch.update(ref1, { order: order2 });

                const ref2 = doc(db, exercisesPath, adjacentExercise.Exercise_ID);
                batch.update(ref2, { order: order1 });

                await batch.commit();
                // Real-time listener will handle the UI update
            } catch (error) {
                console.error("Error reordering exercises: ", error);
                showMessage("Failed to reorder exercises.", 'error');
            }
        }
        // Expose globally
        window.moveExercise = moveExercise;

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
                const isFirst = index === 0;
                const isLast = index === exercises.length - 1;

                const card = document.createElement('div');
                card.className = `card bg-white dark:bg-gray-700 p-4 rounded-xl shadow-lg border-l-4 border-cyan-500 dark:border-cyan-400 mb-4`; 
                card.setAttribute('data-id', exercise.Exercise_ID);
                
                // Changed onclick to use global handler with ID
                card.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex-grow cursor-pointer" onclick="handleEditExercise('${exercise.Exercise_ID}')">
                            <div class="flex justify-between items-start mb-1">
                                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">${exercise.Name}</h3>
                                <span class="bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs px-2 py-1 rounded-full font-semibold uppercase tracking-wide mr-2">${exercise.Focus_Area || 'General'}</span>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">${exercise.Physio_Notes || 'No notes available.'}</p>
                        </div>
                        <div class="flex flex-col items-center space-y-2 ml-3 border-l dark:border-gray-600 pl-3">
                            <button ${isFirst ? 'disabled' : ''} onclick="moveExercise('${exercise.Exercise_ID}', 'up')" class="p-1 rounded-full bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-cyan-600 dark:text-cyan-400">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>
                            </button>
                            <button ${isLast ? 'disabled' : ''} onclick="moveExercise('${exercise.Exercise_ID}', 'down')" class="p-1 rounded-full bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-cyan-600 dark:text-cyan-400">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
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
         * Switches view to the Add/Edit Exercise form.
         * @param {object|null} exerciseToEdit - The exercise object if editing, or null if adding new.
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