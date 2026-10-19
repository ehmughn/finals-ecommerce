document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Views
    const homeView = document.getElementById('home-page');
    const questionView = document.getElementById('question-page');
    const resultView = document.getElementById('result-page');

    // Controls & Buttons
    const startBtn = document.getElementById('start-btn');
    const endTestBtn = document.getElementById('end-test-btn');
    const restartBtn = document.getElementById('restart-btn');
    const homeBtn = document.getElementById('home-btn');
    const lessonSelect = document.getElementById('lesson-select');
    const countSlider = document.getElementById('count-slider');
    const sliderCountDisplay = document.getElementById('slider-count-display');
    const sliderMaxLabel = document.getElementById('slider-max-label');

    // Question Header & Progress Elements
    const progressBarFill = document.getElementById('progress-bar-fill');
    const qCounterEl = document.getElementById('q-counter');
    const qTotalEl = document.getElementById('q-total');
    const liveScoreEl = document.getElementById('live-score');
    const liveAccuracyEl = document.getElementById('live-accuracy');
    const questionIndexBadge = document.getElementById('question-index-badge');
    const questionTextEl = document.getElementById('question-text');

    // Options & Form Elements
    const optionsContainer = document.getElementById('options-container');
    const submitAnswerBtn = document.getElementById('submit-answer-btn');
    const instantFeedbackEl = document.getElementById('instant-feedback');

    // Result Elements
    const resultPercentageEl = document.getElementById('result-percentage');
    const scoreCircleEl = document.getElementById('score-circle');
    const resScoreRatioEl = document.getElementById('res-score-ratio');
    const resCorrectCountEl = document.getElementById('res-correct-count');
    const resWrongCountEl = document.getElementById('res-wrong-count');
    const historyListEl = document.getElementById('history-list');
    const filterAllCountEl = document.getElementById('filter-all-count');
    const filterCorrectCountEl = document.getElementById('filter-correct-count');
    const filterWrongCountEl = document.getElementById('filter-wrong-count');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // State Variables
    let sessionQuestions = [];
    let currentIndex = 0;
    let currentQuestion = null;
    let currentDisplayOptions = [];
    let selectedOption = null;
    let isWaitingForNext = false;
    let score = 0;
    let answeredLog = [];
    let activeFilter = 'all';

    // --- Helper: Shuffle Array (Fisher-Yates) ---
    function shuffleArray(array) {
        const copy = [...array];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    // --- Helper: HTML Escape ---
    function escapeHtml(str) {
        if (!str) return '';
        return str.toString().replace(/[&<>"']/g, function (m) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[m];
        });
    }

    // --- View Switcher ---
    function showView(viewId) {
        [homeView, questionView, resultView].forEach(view => {
            if (view) view.classList.remove('active');
        });
        const target = document.getElementById(viewId);
        if (target) {
            target.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // --- Slider & Module Helper ---
    function getAvailablePool(selectedLesson) {
        if (selectedLesson === 'ALL') {
            return QUESTION_DATABASE.flatMap(w =>
                w.questions.map(q => ({ ...q, week: w.week }))
            );
        } else {
            const weekMatch = selectedLesson.match(/Week\s*(\d+)/i);
            const weekNum = weekMatch ? parseInt(weekMatch[1], 10) : null;
            const weekObj = QUESTION_DATABASE.find(w => w.week === weekNum);
            return weekObj ? weekObj.questions.map(q => ({ ...q, week: weekObj.week })) : [];
        }
    }

    function updateSliderRange() {
        if (!countSlider || !lessonSelect) return;
        const selectedLesson = lessonSelect.value;
        const pool = getAvailablePool(selectedLesson);
        const total = pool.length;

        if (total === 0) return;

        countSlider.min = total > 1 ? 1 : 1;
        countSlider.max = total;
        countSlider.value = total;

        if (sliderMaxLabel) sliderMaxLabel.textContent = `${total}`;
        updateSliderDisplay();
    }

    function updateSliderDisplay() {
        if (!countSlider || !sliderCountDisplay) return;
        const val = parseInt(countSlider.value, 10);
        const max = parseInt(countSlider.max, 10);

        if (val === max) {
            sliderCountDisplay.textContent = `All`;
        } else {
            sliderCountDisplay.textContent = `${val}`;
        }
    }

    // --- Start Exam ---
    function startExam() {
        const selectedLesson = lessonSelect ? lessonSelect.value : 'ALL';
        const pool = getAvailablePool(selectedLesson);

        if (!pool || pool.length === 0) {
            alert('No questions available for the selected module.');
            return;
        }

        // Shuffle questions so every attempt is non-repeating and randomized
        let shuffledPool = shuffleArray(pool);

        // Apply question limit from slider
        if (countSlider) {
            const limit = parseInt(countSlider.value, 10);
            if (!isNaN(limit) && limit > 0 && limit < shuffledPool.length) {
                shuffledPool = shuffledPool.slice(0, limit);
            }
        }

        sessionQuestions = shuffledPool;
        currentIndex = 0;
        score = 0;
        answeredLog = [];
        selectedOption = null;
        isWaitingForNext = false;

        showView('question-page');
        loadQuestion(0);
    }

    // --- Load Question by Index ---
    function loadQuestion(index) {
        if (index >= sessionQuestions.length) {
            endExam();
            return;
        }

        currentIndex = index;
        currentQuestion = sessionQuestions[index];
        selectedOption = null;
        isWaitingForNext = false;

        // Reset instant feedback
        instantFeedbackEl.className = 'feedback-banner';
        instantFeedbackEl.style.display = 'none';
        instantFeedbackEl.innerHTML = '';

        // Reset submit button
        submitAnswerBtn.disabled = true;
        submitAnswerBtn.textContent = 'Submit Answer';
        submitAnswerBtn.className = 'btn btn-secondary';

        // Update live stats & progress bar
        updateLiveStats();
        if (questionIndexBadge) {
            questionIndexBadge.textContent = `Question ${currentIndex + 1} of ${sessionQuestions.length}`;
        }
        questionTextEl.textContent = currentQuestion.question;

        // Render Multiple Choice Options
        renderOptions();
    }

    // --- Render Multiple Choice Options ---
    function renderOptions() {
        optionsContainer.innerHTML = '';

        // Randomize option order for this display so position varies
        const rawOptions = currentQuestion.options && currentQuestion.options.length === 4
            ? currentQuestion.options
            : [currentQuestion.answer, 'Alternative Option A', 'Alternative Option B', 'Alternative Option C'];

        currentDisplayOptions = shuffleArray(rawOptions);
        const letters = ['A', 'B', 'C', 'D'];

        currentDisplayOptions.forEach((optText, idx) => {
            const letter = letters[idx];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'option-btn';
            btn.dataset.value = optText;
            btn.dataset.index = idx;
            btn.dataset.letter = letter;
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', 'false');

            btn.innerHTML = `
                <span class="option-badge">${letter}</span>
                <span class="option-text">${escapeHtml(optText)}</span>
                <span class="option-status-icon"></span>
            `;

            btn.addEventListener('click', () => {
                if (isWaitingForNext) return;
                selectOption(optText, btn);
            });

            optionsContainer.appendChild(btn);
        });
    }

    // --- Select an Option ---
    function selectOption(optValue, btnEl) {
        if (isWaitingForNext) return;

        selectedOption = optValue;

        const allBtns = optionsContainer.querySelectorAll('.option-btn');
        allBtns.forEach(b => {
            b.classList.remove('selected');
            b.setAttribute('aria-checked', 'false');
        });

        btnEl.classList.add('selected');
        btnEl.setAttribute('aria-checked', 'true');

        // Enable submit button
        submitAnswerBtn.disabled = false;
    }

    // --- Evaluate Answer Helper ---
    function evaluateAnswer(userPick, questionObj) {
        if (!userPick || !questionObj) return false;
        const cleanUser = userPick.trim().toLowerCase();

        if (typeof questionObj.answer === 'string') {
            return cleanUser === questionObj.answer.trim().toLowerCase();
        }

        if (Array.isArray(questionObj.answer)) {
            return questionObj.answer.some(ans =>
                ans.toString().trim().toLowerCase() === cleanUser
            );
        }

        return false;
    }

    // --- Submit Answer Handler ---
    function submitAnswer() {
        if (isWaitingForNext) {
            loadQuestion(currentIndex + 1);
            return;
        }

        if (!selectedOption) return;

        const isCorrect = evaluateAnswer(selectedOption, currentQuestion);

        if (isCorrect) {
            score++;
        }

        const validAnswerText = Array.isArray(currentQuestion.answer)
            ? currentQuestion.answer[0]
            : currentQuestion.answer;

        answeredLog.push({
            questionNum: currentIndex + 1,
            week: currentQuestion.week,
            question: currentQuestion.question,
            userAnswer: selectedOption,
            correctAnswer: validAnswerText,
            isCorrect: isCorrect,
            options: [...currentDisplayOptions]
        });

        isWaitingForNext = true;

        // Visual feedback on options
        const allBtns = optionsContainer.querySelectorAll('.option-btn');
        allBtns.forEach(btn => {
            btn.disabled = true;
            const val = btn.dataset.value;
            const icon = btn.querySelector('.option-status-icon');

            if (val === selectedOption) {
                if (isCorrect) {
                    btn.classList.add('correct');
                    if (icon) icon.textContent = '✓';
                } else {
                    btn.classList.add('wrong');
                    if (icon) icon.textContent = '✕';
                }
            } else if (evaluateAnswer(val, currentQuestion)) {
                // Reveal the correct option in green
                btn.classList.add('reveal-correct');
                if (icon) icon.textContent = '✓';
            } else {
                btn.classList.add('dimmed');
            }
        });

        // Instant Feedback Banner
        if (isCorrect) {
            instantFeedbackEl.className = 'feedback-banner correct';
            instantFeedbackEl.innerHTML = `<strong>✓ Correct!</strong>`;
        } else {
            instantFeedbackEl.className = 'feedback-banner wrong';
            instantFeedbackEl.innerHTML = `<strong>✕ Incorrect.</strong>`;
        }
        instantFeedbackEl.style.display = 'block';

        // Update live stats
        updateLiveStats();

        // Update action button for progression
        if (currentIndex === sessionQuestions.length - 1) {
            submitAnswerBtn.textContent = 'View Exam Results ➔';
        } else {
            submitAnswerBtn.textContent = 'Next Question ➔';
        }
        submitAnswerBtn.className = 'btn btn-primary';
        submitAnswerBtn.disabled = false;
        submitAnswerBtn.focus();
    }

    // --- Update Live Stats & Progress Bar ---
    function updateLiveStats() {
        const total = sessionQuestions.length;
        const currentNum = Math.min(currentIndex + 1, total);

        if (qCounterEl) qCounterEl.textContent = currentNum;
        if (qTotalEl) qTotalEl.textContent = total;
        if (liveScoreEl) liveScoreEl.textContent = score;

        const answeredCount = answeredLog.length;
        const accuracy = answeredCount > 0 ? Math.round((score / answeredCount) * 100) : 0;
        if (liveAccuracyEl) liveAccuracyEl.textContent = `${accuracy}%`;

        if (progressBarFill && total > 0) {
            const progressPercent = Math.min(Math.round((answeredCount / total) * 100), 100);
            progressBarFill.style.width = `${progressPercent}%`;
        }
    }

    // --- End Test & View Results ---
    function endExam() {
        const totalAnswered = answeredLog.length;
        const correctCount = score;
        const wrongCount = totalAnswered - correctCount;
        const percentage = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

        // Render Metric Values
        if (resScoreRatioEl) resScoreRatioEl.textContent = `${correctCount} / ${totalAnswered}`;
        if (resCorrectCountEl) resCorrectCountEl.textContent = correctCount;
        if (resWrongCountEl) resWrongCountEl.textContent = wrongCount;
        if (resultPercentageEl) resultPercentageEl.textContent = `${percentage}%`;
        if (scoreCircleEl) scoreCircleEl.style.setProperty('--percentage', percentage);

        // Update Filter Counts
        if (filterAllCountEl) filterAllCountEl.textContent = totalAnswered;
        if (filterCorrectCountEl) filterCorrectCountEl.textContent = correctCount;
        if (filterWrongCountEl) filterWrongCountEl.textContent = wrongCount;

        // Render History List
        activeFilter = 'all';
        filterBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.filter === 'all'));
        renderHistoryList();

        showView('result-page');
    }

    // --- Render History Breakdown List ---
    function renderHistoryList() {
        historyListEl.innerHTML = '';

        if (!answeredLog.length) {
            historyListEl.innerHTML = `
                <div class="history-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No questions were answered during this session.
                </div>
            `;
            return;
        }

        const filteredLog = answeredLog.filter(item => {
            if (activeFilter === 'correct') return item.isCorrect;
            if (activeFilter === 'wrong') return !item.isCorrect;
            return true;
        });

        if (!filteredLog.length) {
            historyListEl.innerHTML = `
                <div class="history-item" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No ${activeFilter} questions to display.
                </div>
            `;
            return;
        }

        filteredLog.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = `history-item ${item.isCorrect ? 'is-correct' : 'is-wrong'}`;

            itemEl.innerHTML = `
                <div class="history-top">
                    <div style="display: flex; gap: 0.6rem; align-items: center;">
                        <span class="history-q-num">Question #${item.questionNum}</span>
                        ${item.week ? `<span class="topic-badge" style="font-size: 0.72rem; padding: 0.15rem 0.6rem;">Week ${item.week}</span>` : ''}
                    </div>
                    <span class="verdict-badge ${item.isCorrect ? 'correct' : 'wrong'}">
                        ${item.isCorrect ? '✓ Correct' : '✕ Wrong'}
                    </span>
                </div>
                <div class="history-q-text">${escapeHtml(item.question)}</div>
                <div class="history-details">
                    <div class="detail-block">
                        <label>Your Choice</label>
                        <div class="detail-val ${item.isCorrect ? 'user-val-correct' : 'user-val-wrong'}">
                            ${escapeHtml(item.userAnswer)}
                        </div>
                    </div>
                    <div class="detail-block">
                        <label>Correct Answer</label>
                        <div class="detail-val correct-val">
                            ${escapeHtml(item.correctAnswer)}
                        </div>
                    </div>
                </div>
            `;

            historyListEl.appendChild(itemEl);
        });
    }

    // --- Event Listeners ---
    if (startBtn) startBtn.addEventListener('click', startExam);
    if (submitAnswerBtn) submitAnswerBtn.addEventListener('click', submitAnswer);

    if (endTestBtn) {
        endTestBtn.addEventListener('click', () => {
            if (answeredLog.length > 0 || confirm('Are you sure you want to end the test early?')) {
                endExam();
            }
        });
    }

    if (restartBtn) restartBtn.addEventListener('click', startExam);

    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            showView('home-page');
        });
    }

    if (lessonSelect) {
        lessonSelect.addEventListener('change', updateSliderRange);
    }

    if (countSlider) {
        countSlider.addEventListener('input', updateSliderDisplay);
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            activeFilter = e.target.dataset.filter;
            renderHistoryList();
        });
    });

    // Initialize Slider Range
    updateSliderRange();
});
