
        const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
        const IPEauditories = ["502-2 к.", "601-2 к.", "603-2 к.", "604-2 к.", "605-2 к.", "607-2 к.", "611-2 к.", "613-2 к.", "615-2 к."];
        const additionalAuditories = ["602-2 к."];

        // Порядок временных интервалов для сортировки
        const timeSlotsOrder = [
            "08:30—09:55",
            "10:05—11:30 ",
            "12:00—13:25",
            "13:35—15:00",
            "15:30—16:55",
            "17:05—18:30",
            "19:00—20:25",
            "20:35—22:00"
        ];

        // Глобальные переменные для хранения данных
        let currentWeekNumber = null;
        let teachersData = null;
        let teacherSchedulesData = null;
        let lastIsMobile = (typeof window !== 'undefined') ? window.innerWidth <= 768 : false;
        let timeUpdateTimer = null;
        // Dev mode check: only show add/edit controls on dev.html
        const isDevHtml = (typeof window !== 'undefined') && (window.location.pathname.endsWith('dev.html') || window.location.href.indexOf('dev.html') !== -1);

        // Функция для получения списка аудиторий с учетом чекбокса
        function getAuditoriesToShow() {
            const show602 = document.getElementById('show602Checkbox').checked;
            return show602 ? [...IPEauditories, ...additionalAuditories] : IPEauditories;
        }

        async function fetchJson(url) {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            return response.json();
        }

        // --- Crypto helpers for decrypting wrapper saved by odwnld.js ---
        // Default passphrase used to decrypt files created by the downloader
        const DEFAULT_PASSPHRASE = 'b23avqbq*Mxf)y#D';

        function base64ToArrayBuffer(base64) {
            const binary = atob(base64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            return bytes.buffer;
        }

        async function deriveKey(password, salt, iterations = 100000) {
            const enc = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
            return crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        }

        function base64ToArrayBuffer(base64) {
            const binary = atob(base64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            return bytes.buffer;
        }

        async function decryptWrapper(wrapper, password) {
            if (!wrapper || !wrapper.__encrypted) throw new Error('Not encrypted wrapper');
            const iterations = wrapper.iterations || 100000;
            const saltBuf = base64ToArrayBuffer(wrapper.salt);
            const ivBuf = base64ToArrayBuffer(wrapper.iv);
            const dataBuf = base64ToArrayBuffer(wrapper.data);
            const key = await deriveKey(password, new Uint8Array(saltBuf), iterations);
            const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(ivBuf) }, key, dataBuf);
            const dec = new TextDecoder();
            const jsonStr = dec.decode(plainBuf);
            return JSON.parse(jsonStr);
        }

        async function decryptWrapper(wrapper, password) {
            if (!wrapper || !wrapper.__encrypted) throw new Error('Not encrypted wrapper');
            const iterations = wrapper.iterations || 100000;
            const saltBuf = base64ToArrayBuffer(wrapper.salt);
            const ivBuf = base64ToArrayBuffer(wrapper.iv);
            const dataBuf = base64ToArrayBuffer(wrapper.data);
            const key = await deriveKey(password, new Uint8Array(saltBuf), iterations);
            const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(ivBuf) }, key, dataBuf);
            const dec = new TextDecoder();
            const jsonStr = dec.decode(plainBuf);
            return JSON.parse(jsonStr);
        }

        // Helpers to encrypt objects (used when exporting announcement.json)
        function arrayBufferToBase64(buffer) {
            let binary = '';
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }

        async function encryptObject(obj, password) {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await deriveKey(password, salt, 100000);
            const enc = new TextEncoder();
            const data = enc.encode(JSON.stringify(obj));
            const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
            return {
                __encrypted: true,
                kdf: 'PBKDF2',
                iterations: 100000,
                salt: arrayBufferToBase64(salt.buffer),
                iv: arrayBufferToBase64(iv.buffer),
                data: arrayBufferToBase64(cipher)
            };
        }

        async function loadInitialData() {
            document.getElementById('loading').style.display = 'flex';
            try {
        // Обновляем текст загрузки
        document.querySelector('#loading span').textContent = 'Загрузка...';

        // Загружаем локальный файл с выгрузкой
        let payload = await fetchJson('./schedules.json');
        // Если файл зашифрован (обёртка), пытаемся автоматически расшифровать предустановленным паролем
        if (payload && payload.__encrypted) {
            try {
                payload = await decryptWrapper(payload, DEFAULT_PASSPHRASE);
                console.info('schedules.json успешно расшифрован предустановленным паролем');
            } catch (e) {
                console.error('Не удалось расшифровать schedules.json предустановленным паролем:', e);
                throw new Error('Не удалось расшифровать schedules.json');
            }
        }
        // Сохраняем оригинальный payload для дальнейшего экспорта/добавления
        window.originalPayload = payload;
        teachersData = payload.teachers || [];
        teacherSchedulesData = payload.teacherSchedules || {};
                // Отображаем дату генерации файла schedules.json (generatedAt) в контролах, если элемент присутствует
                try {
                    const genEl = document.getElementById('dataGenerated');
                    if (genEl) {
                        const gen = payload && payload.generatedAt ? new Date(payload.generatedAt) : null;
                        if (gen && !isNaN(gen)) {
                            genEl.textContent = `Дата подгрузки: ${gen.toLocaleString('ru-RU')}`;
                        } else {
                            genEl.textContent = '';
                        }
                    }
                } catch (e) { console.warn('Не удалось установить generatedAt в controls', e); }
                // Попробуем загрузить локальный файл объявлений (announcement.json). Если нет — создадим пустую структуру
                try {
                    let annPayload = await fetchJson('./announcement.json');
                    // Если announcement.json зашифрован — попытаемся расшифровать дефолтным паролем
                    if (annPayload && annPayload.__encrypted) {
                        try {
                            annPayload = await decryptWrapper(annPayload, DEFAULT_PASSPHRASE);
                        } catch (e) {
                            console.error('Не удалось расшифровать announcement.json:', e);
                            annPayload = { announcements: [] };
                        }
                    }
                    window.announcementsPayload = annPayload || { announcements: [] };
                } catch (err) {
                    window.announcementsPayload = { announcements: [] };
                }
                // Ensure every announcement has a stable _id
                if (!window.announcementsPayload) window.announcementsPayload = { announcements: [] };
                window.announcementsPayload.announcements = (window.announcementsPayload.announcements || []).map(a => {
                    if (!a._id) a._id = generateAnnId();
                    return a;
                });
                // Создаём скрытый модальный элемент и заполняем datalist'ы (чтобы можно было выбирать или вводить)
                try {
                    ensureAnnouncementModal();
                    fillAnnouncementDatalists();
                } catch (e) { console.warn('Не удалось инициализировать datalist объявлений', e); }
                
                // Устанавливаем текущую дату
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                document.getElementById('datePicker').value = `${yyyy}-${mm}-${dd}`;
                
                // Обновляем отображение недели (локальный расчет от 1 сентября)
                const dayName = dayNames[today.getDay()]; 
                const initialWeekNumber = calculateWeekNumber(today);
                document.getElementById('weekDisplay').textContent = `${today.toLocaleDateString()} (${dayName}), ${initialWeekNumber}-я учебная неделя`;
                 // Обновляем текст загрузки
        document.querySelector('#loading span').textContent = 'Формирование расписания...';
                // Загружаем расписание для текущей даты
                await updateSchedule(today, initialWeekNumber);
            } catch (error) {
                console.error('Ошибка при загрузке данных:', error);
                alert('Произошла ошибка при загрузке данных');
            } finally {
                document.getElementById('loading').style.display = 'none';
            }
        }

        // Создаёт модальное окно для добавления объявления (если ещё не создано)
        function ensureAnnouncementModal() {
            if (document.getElementById('announcementModal')) return;
            const modal = document.createElement('div');
            modal.id = 'announcementModal';
            modal.style.position = 'fixed';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.display = 'none';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.background = 'rgba(0,0,0,0.4)';
            modal.style.zIndex = '9999';

            const box = document.createElement('div');
            box.style.background = '#fff';
            box.style.padding = '16px';
            box.style.borderRadius = '8px';
            box.style.maxWidth = '480px';
            box.style.width = '92%';
            box.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';

                        box.innerHTML = `
                                <h3 style="margin-top:0"><span id="ann-modal-title">Добавить объявление</span></h3>
                                <div style="display:flex;flex-direction:column;gap:8px">
                                    <label>Аудитория:<br><input id="ann-auditory" type="text" readonly></label>
                                    <label>Дата:<br><input id="ann-date" type="date"></label>
                                    <label>Время начала:<br><input id="ann-start" type="time"></label>
                                    <label>Время окончания:<br><input id="ann-end" type="time"></label>
                                    <!-- поле "Текст объявления" удалено: используется только "Заметки" -->
                                    <label>Номер группы (необязательно):<br>
                                        <input id="ann-group" type="text" list="groups-list" placeholder="введите или выберите из списка">
                                        <datalist id="groups-list"></datalist>
                                    </label>
                                    <label>ФИО преподавателя (необязательно):<br>
                                        <input id="ann-teacher" type="text" list="teachers-list" placeholder="введите или выберите из списка">
                                        <datalist id="teachers-list"></datalist>
                                    </label>
                                    <label>Заметки (необязательно):<br><textarea id="ann-notes" rows="3"></textarea></label>
                                    <div style="display:flex;gap:8px;justify-content:flex-end">
                                        <button id="ann-delete" style="display:none;background:#fff;border:1px solid #e04;color:#c00;padding:6px 8px;border-radius:6px">Удалить</button>
                                        <button id="ann-cancel">Отмена</button>
                                        <button id="ann-submit">Добавить</button>
                                    </div>
                                </div>
                        `;

            modal.appendChild(box);
            document.body.appendChild(modal);

            document.getElementById('ann-cancel').addEventListener('click', () => {
                // clear edit state
                modal.dataset.editId = '';
                document.getElementById('ann-delete').style.display = 'none';
                document.getElementById('ann-submit').textContent = 'Добавить';
                document.getElementById('ann-modal-title').textContent = 'Добавить объявление';
                modal.style.display = 'none';
            });

            document.getElementById('ann-delete').addEventListener('click', () => {
                const editId = modal.dataset.editId;
                if (!editId) return;
                if (!window.announcementsPayload) window.announcementsPayload = { announcements: [] };
                const idx = window.announcementsPayload.announcements.findIndex(a => a._id === editId);
                if (idx !== -1 && confirm('Удалить это объявление?')) {
                    window.announcementsPayload.announcements.splice(idx, 1);
                    // re-render
                    if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                        const selectedDate = new Date(document.getElementById('datePicker').value);
                        const weekNumber = calculateWeekNumber(selectedDate);
                        updateSchedule(selectedDate, weekNumber);
                    }
                }
                modal.dataset.editId = '';
                document.getElementById('ann-delete').style.display = 'none';
                document.getElementById('ann-submit').textContent = 'Добавить';
                document.getElementById('ann-modal-title').textContent = 'Добавить объявление';
                modal.style.display = 'none';
            });

            document.getElementById('ann-submit').addEventListener('click', () => {
                const auditory = document.getElementById('ann-auditory').value;
                const date = document.getElementById('ann-date').value;
                const start = document.getElementById('ann-start').value;
                const end = document.getElementById('ann-end').value;
                // текст объявления удалён; используем только заметки из ann-notes
                const group = document.getElementById('ann-group').value;
                const teacher = document.getElementById('ann-teacher').value;
                const notes = document.getElementById('ann-notes').value;

                if (!auditory || !date || !start) {
                    alert('Пожалуйста, укажите аудиторию, дату и время начала.');
                    return;
                }

                const noteValue = (notes && notes.trim()) || null;

                const annObj = {
                    _id: null,
                    announcement: true,
                    auditories: [auditory],
                    note: noteValue,
                    startLessonTime: start,
                    endLessonTime: end || start,
                    startLessonDate: date.split('-').reverse().join('.'),
                    endLessonDate: date.split('-').reverse().join('.'),
                    dateLesson: null,
                    lessonTypeAbbrev: null,
                    studentGroups: group ? [{ name: group }] : [],
                    teacher: teacher || null
                };

                const submitBtn = document.getElementById('ann-submit');
                if (submitBtn.dataset.busy === '1') return;
                submitBtn.dataset.busy = '1';
                submitBtn.disabled = true;

                // If editing — update existing
                const editId = modal.dataset.editId;
                if (editId) {
                    if (!window.announcementsPayload) window.announcementsPayload = { announcements: [] };
                    const idx = window.announcementsPayload.announcements.findIndex(a => a._id === editId);
                    if (idx !== -1) {
                        annObj._id = editId;
                        window.announcementsPayload.announcements[idx] = annObj;
                        // re-render after edit
                        if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                            const selectedDate = new Date(document.getElementById('datePicker').value);
                            const weekNumber = calculateWeekNumber(selectedDate);
                            updateSchedule(selectedDate, weekNumber);
                        }
                    } else {
                        // fallback: add as new
                        annObj._id = generateAnnId();
                        window.announcementsPayload.announcements.push(annObj);
                        if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                            const selectedDate = new Date(document.getElementById('datePicker').value);
                            const weekNumber = calculateWeekNumber(selectedDate);
                            updateSchedule(selectedDate, weekNumber);
                        }
                    }
                } else {
                    // add new
                    annObj._id = generateAnnId();
                    addManualAnnouncement(auditory, date, annObj, teacher);
                }

                // reset modal state
                modal.dataset.editId = '';
                document.getElementById('ann-delete').style.display = 'none';
                document.getElementById('ann-submit').textContent = 'Добавить';
                document.getElementById('ann-modal-title').textContent = 'Добавить объявление';
                modal.style.display = 'none';

                setTimeout(() => { submitBtn.dataset.busy = '0'; submitBtn.disabled = false; }, 300);
            });
        }

        // Собирает уникальные номера групп из teacherSchedulesData
        function extractUniqueGroups() {
            const set = new Set();
            try {
                if (!teacherSchedulesData) return [];
                for (const key in teacherSchedulesData) {
                    const sch = teacherSchedulesData[key] || {};
                    ['schedules', 'previousSchedules', 'exams'].forEach(type => {
                        if (type === 'exams') {
                            const arr = sch.exams || [];
                            arr.forEach(entry => {
                                (entry.studentGroups || []).forEach(g => { if (g && g.name) set.add(g.name); });
                            });
                        } else {
                            const days = sch[type] || {};
                            Object.values(days).forEach(dayArr => {
                                (dayArr || []).forEach(lesson => {
                                    (lesson.studentGroups || []).forEach(g => { if (g && g.name) set.add(g.name); });
                                });
                            });
                        }
                    });
                }
            } catch (e) {
                console.warn('Ошибка при извлечении групп:', e);
            }
            return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
        }

        // Пытаемся найти urlId преподавателя по строке ФИО (включая варианты с рангом в скобках)
        function findTeacherUrlIdByFio(fioStr) {
            try {
                if (!fioStr || !Array.isArray(teachersData)) return null;
                const normalize = s => (s || '').replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
                const target = normalize(fioStr);
                if (!target) return null;

                // 1) точное совпадение по fio
                for (const t of teachersData) {
                    if (!t || !t.fio) continue;
                    if (normalize(t.fio) === target) return t.urlId || null;
                }

                // 2) вхождение (например, запись без должности)
                for (const t of teachersData) {
                    if (!t || !t.fio) continue;
                    if (normalize(t.fio).includes(target) || target.includes(normalize(t.fio))) return t.urlId || null;
                }

                // 3) попытка по фамилии (первое слово в строке)
                const lastName = target.split(' ')[0];
                if (lastName) {
                    for (const t of teachersData) {
                        if (!t || !t.lastName) continue;
                        if (String(t.lastName).toLowerCase().startsWith(lastName)) return t.urlId || null;
                    }
                }
            } catch (e) {
                console.warn('findTeacherUrlIdByFio error', e);
            }
            return null;
        }

        // Заполняет datalist для групп и преподавателей (позволяет ввод или выбор)
        function fillAnnouncementDatalists() {
            const groupsList = document.getElementById('groups-list');
            const teachersList = document.getElementById('teachers-list');
            try {
                if (groupsList) {
                    groupsList.innerHTML = '';
                    const groups = extractUniqueGroups();
                    groups.forEach(g => {
                        const opt = document.createElement('option');
                        opt.value = g;
                        groupsList.appendChild(opt);
                    });
                }
                if (teachersList) {
                    teachersList.innerHTML = '';
                    (teachersData || []).forEach(t => {
                        const name = t.fio || [t.lastName, t.firstName, t.middleName].filter(Boolean).join(' ');
                        const opt = document.createElement('option');
                        opt.value = name;
                        teachersList.appendChild(opt);
                    });
                }
            } catch (e) {
                console.warn('Ошибка при заполнении datalist объявлений:', e);
            }
        }

        function openAnnouncementModal(auditory, timeRange, dateIso, editId) {
            ensureAnnouncementModal();
            const modal = document.getElementById('announcementModal');
            const [start, end] = timeRange.split('—').map(s => s.trim());
            document.getElementById('ann-auditory').value = auditory;
            if (dateIso) document.getElementById('ann-date').value = dateIso;
            document.getElementById('ann-start').value = start.replace(' ', '') || '';
            document.getElementById('ann-end').value = (end || start).replace(' ', '') || '';
            // If editId provided, load announcement into fields
            if (editId && window.announcementsPayload) {
                const ann = window.announcementsPayload.announcements.find(a => a._id === editId);
                if (ann) {
                    document.getElementById('ann-auditory').value = (ann.auditories && ann.auditories[0]) || auditory;
                    document.getElementById('ann-date').value = ddmmyyyyToIso(ann.startLessonDate) || dateIso || '';
                    document.getElementById('ann-start').value = (ann.startLessonTime || start).replace(' ', '');
                    document.getElementById('ann-end').value = (ann.endLessonTime || ann.startLessonTime || end || start).replace(' ', '');
                    document.getElementById('ann-group').value = (ann.studentGroups && ann.studentGroups[0] && ann.studentGroups[0].name) || '';
                    document.getElementById('ann-teacher').value = ann.teacher || '';
                    document.getElementById('ann-notes').value = ann.note || '';
                    modal.dataset.editId = editId;
                    document.getElementById('ann-delete').style.display = 'inline-block';
                    document.getElementById('ann-submit').textContent = 'Сохранить';
                    document.getElementById('ann-modal-title').textContent = 'Редактировать объявление';
                    // Hide the 'Текст объявления' field when editing (user request)
                    try {
                        // поле текста объявления удалено — ничего скрывать не нужно
                    } catch (e) { /* ignore if DOM structure differs */ }
                }
            } else {
                // поле текста объявления удалено
                document.getElementById('ann-group').value = '';
                document.getElementById('ann-teacher').value = '';
                document.getElementById('ann-notes').value = '';
                modal.dataset.editId = '';
                document.getElementById('ann-delete').style.display = 'none';
                document.getElementById('ann-submit').textContent = 'Добавить';
                document.getElementById('ann-modal-title').textContent = 'Добавить объявление';
                // Ensure 'Текст объявления' visible when adding
                try {
                    // поле текста объявления удалено — ничего показывать не нужно
                } catch (e) { /* ignore if DOM structure differs */ }
            }
            modal.style.display = 'flex';
        }

        // --- Export / Import Announcements UI ---
        function ensureExportModal() {
            if (document.getElementById('annExportModal')) return;
            const modal = document.createElement('div');
            modal.id = 'annExportModal';
            modal.style.position = 'fixed';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.display = 'none';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.background = 'rgba(0,0,0,0.45)';
            modal.style.zIndex = '10000';

            const box = document.createElement('div');
            box.style.background = '#fff';
            box.style.padding = '12px';
            box.style.borderRadius = '8px';
            box.style.maxWidth = '760px';
            box.style.width = '94%';
            box.style.maxHeight = '80%';
            box.style.overflow = 'auto';

            box.innerHTML = `
                <h3 style="margin-top:0">Экспорт/Импорт объявлений</h3>
                <div style="display:flex;gap:8px;margin-bottom:8px">
                  <button id="ann-copy-btn">Копировать в буфер</button>
                  <button id="ann-close-btn">Закрыть</button>
                </div>
                <textarea id="ann-export-text" rows="18" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:6px;font-family:monospace"></textarea>
            `;

            modal.appendChild(box);
            document.body.appendChild(modal);

            document.getElementById('ann-close-btn').addEventListener('click', () => {
                modal.style.display = 'none';
            });

            document.getElementById('ann-copy-btn').addEventListener('click', async () => {
                const txt = document.getElementById('ann-export-text').value;
                if (!txt) return alert('Нечего копировать');
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(txt);
                        alert('Содержимое скопировано в буфер обмена');
                    } else {
                        const ta = document.getElementById('ann-export-text');
                        ta.select();
                        document.execCommand('copy');
                        alert('Содержимое скопировано в буфер обмена');
                    }
                } catch (err) {
                    console.error('Не удалось скопировать', err);
                    alert('Ошибка при копировании');
                }
            });
        }

        function openExportModal() {
            ensureExportModal();
            const modal = document.getElementById('annExportModal');
            const ta = document.getElementById('ann-export-text');
            try {
                ta.value = JSON.stringify(window.announcementsPayload || { announcements: [] }, null, 2);
            } catch (err) {
                ta.value = '{}';
            }
            modal.style.display = 'flex';
        }

        // Обработка загрузки файла announcement.json через скрытый input
        function handleAnnFileUpload(inputEl) {
            const file = inputEl.files && inputEl.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    let parsed = JSON.parse(e.target.result);
                    // Если файл зашифрован — попытаемся расшифровать дефолтным паролем
                    if (parsed && parsed.__encrypted) {
                        try {
                            parsed = await decryptWrapper(parsed, DEFAULT_PASSPHRASE);
                        } catch (err) {
                            alert('Не удалось расшифровать загруженный announcement.json');
                            return;
                        }
                    }
                    if (!parsed || !Array.isArray(parsed.announcements)) {
                        alert('Неверный формат файла. Ожидается объект с полем "announcements" (массив).');
                        return;
                    }
                    // Merge with existing announcements
                    const incoming = parsed.announcements;
                    let added = 0;
                    if (!window.announcementsPayload) window.announcementsPayload = { announcements: [] };
                    for (const ann of incoming) {
                        const exists = window.announcementsPayload.announcements.some(item => (
                            (item.startLessonTime || '') === (ann.startLessonTime || '') &&
                            (item.startLessonDate || '') === (ann.startLessonDate || '') &&
                            JSON.stringify(item.auditories || []) === JSON.stringify(ann.auditories || []) &&
                            ((item.note || '') === (ann.note || ''))
                        ));
                        if (!exists) {
                            if (!ann._id) ann._id = generateAnnId();
                            window.announcementsPayload.announcements.push(ann);
                            added++;
                        }
                    }
                    // Re-render
                    if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                        const selectedDate = new Date(document.getElementById('datePicker').value);
                        const weekNumber = calculateWeekNumber(selectedDate);
                        updateSchedule(selectedDate, weekNumber);
                    }
                    alert(`Импорт завершён. Добавлено ${added} новых объявлений.`);
                } catch (err) {
                    console.error('Ошибка чтения файла объявлений', err);
                    alert('Ошибка при чтении файла: ' + err.message);
                }
            };
            reader.readAsText(file, 'utf-8');
            // очистим значение, чтобы тот же файл можно было загрузить повторно при необходимости
            inputEl.value = '';
        }

        // Добавляет объявление в announcement.json-пул, обновляет интерфейс и скачивает announcement.json
        function addManualAnnouncement(auditory, dateIso, annObj, teacherFio) {
            if (!window.announcementsPayload) window.announcementsPayload = { announcements: [] };

            // Убедимся, что auditories поле заполнено
            if (!Array.isArray(annObj.auditories) || annObj.auditories.length === 0) {
                annObj.auditories = [auditory];
            }

            // Дедупликация по дате/времени/аудитории/текст
            const exists = window.announcementsPayload.announcements.some(item => (
                (item.startLessonTime || '') === (annObj.startLessonTime || '') &&
                (item.startLessonDate || '') === (annObj.startLessonDate || '') &&
                JSON.stringify(item.auditories || []) === JSON.stringify(annObj.auditories || []) &&
                ((item.note || '') === (annObj.note || ''))
            ));

            if (!exists) {
                if (!annObj._id) annObj._id = generateAnnId();
                window.announcementsPayload.announcements.push(annObj);
            }

            // Обновим текущую страницу
            if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                const selectedDate = new Date(document.getElementById('datePicker').value);
                const weekNumber = calculateWeekNumber(selectedDate);
                updateSchedule(selectedDate, weekNumber);
            }
        }

        // Скачать current announcement.json (вручную кнопкой)
        async function downloadAnnouncementsFile() {
            try {
                if (!window.announcementsPayload) window.announcementsPayload = { announcements: [] };
                // Защищённый экспорт: шифруем payload предустановленным паролем
                const wrapped = await encryptObject(window.announcementsPayload, DEFAULT_PASSPHRASE);
                const blob = new Blob([JSON.stringify(wrapped, null, 2)], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'announcement.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                alert('Файл announcement.json скачан. Поместите его в папку приложения для сохранения объявлений.');
            } catch (err) {
                console.error('Не удалось скачать announcement.json', err);
                alert('Ошибка при скачивании announcement.json');
            }
        }

        function calculateWeekNumber(selectedDate) {
            if (!selectedDate) return null;
            
            // Находим понедельник для заданной даты
            const getMonday = (date) => {
                const d = new Date(date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Понедельник - первый день
                return new Date(d.setDate(diff));
            };
            
            // Старт учебного года: 1 сентября соответствующего учебного года
            const d = new Date(selectedDate);
            const year = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; // Сентябрь (8) и позже — текущий год, иначе предыдущий
            const academicStart = new Date(year, 8, 1); // 1 сентября
            
            // Неделю 1 считаем как неделю, начинающуюся с понедельника той недели, где 1 сентября
            const academicStartMonday = getMonday(academicStart);
            const selectedMonday = getMonday(d);
            
            const diffMs = selectedMonday.getTime() - academicStartMonday.getTime();
            const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
            
            // 4-недельный цикл: 1..4
            const weekNumber = ((diffWeeks % 4) + 4) % 4 + 1;
            return weekNumber;
        }

        function parseDate(dateStr) {
            if (!dateStr) return null;
    try {
        const parts = dateStr.split('.');
        if (parts.length !== 3) return null;
        
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Месяцы 0-11
        const year = parseInt(parts[2], 10);
        
        return new Date(year, month, day);
    } catch (error) {
        console.error('Ошибка парсинга даты:', dateStr, error);
        return null;
    }
}

        function ddmmyyyyToIso(ddmmy) {
            if (!ddmmy) return '';
            const parts = ddmmy.split('.');
            if (parts.length !== 3) return '';
            const [d, m, y] = parts;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }

        function generateAnnId() {
            return 'ann_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 100000).toString(36);
        }

        // Составляем сигнатуру урока для детектирования дубликатов
        function lessonSignature(lesson) {
            if (!lesson) return '';
            const parts = [];
            parts.push(String(lesson.startTime || ''));
            parts.push(String(lesson.endTime || ''));
            parts.push(String(lesson.subject || ''));
            parts.push(String(lesson.teacher || ''));
            parts.push(String(lesson.dateLesson || ''));
            parts.push(String(lesson.startDate || ''));
            parts.push(String(lesson.endDate || ''));
            // groups may be array of strings
            try {
                const groups = (lesson.groups || []).slice().map(g => String(g)).sort();
                parts.push(JSON.stringify(groups));
            } catch (e) {
                parts.push('[]');
            }
            // auditories (if present)
            try {
                const aud = (lesson.auditories || []).slice().map(a => String(a).trim()).sort();
                parts.push(JSON.stringify(aud));
            } catch (e) {
                parts.push('[]');
            }
            return parts.join('||');
        }

        function timeInRange(start, end, target) {
            return start <= target && target <= end;
        }

        function isTimeInSlot(lessonStart, lessonEnd, slotStart, slotEnd) {
            const lessonStartTime = convertToMinutes(lessonStart);
            const lessonEndTime = convertToMinutes(lessonEnd);
            const slotStartTime = convertToMinutes(slotStart);
            const slotEndTime = convertToMinutes(slotEnd);
            
            return (lessonStartTime < slotEndTime && lessonEndTime > slotStartTime);
        }

        function convertToMinutes(timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        }

        function updateTimeDots() {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            
            // Находим текущий или следующий временной интервал
            let currentSlotIndex = -1;
            
            for (let i = 0; i < timeSlotsOrder.length; i++) {
                const [start, end] = timeSlotsOrder[i].split('—');
                const startMinutes = convertToMinutes(start.trim());
                const endMinutes = convertToMinutes(end.trim());
                
                // Если текущее время до начала этого интервала - это наш следующий интервал
                if (currentMinutes < startMinutes) {
                    currentSlotIndex = i;
                    break;
                }
                // Если мы внутри этого интервала
                if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                    currentSlotIndex = i;
                    break;
                }
            }
            
            // Если все интервалы прошли, выбираем последний
            if (currentSlotIndex === -1) {
                currentSlotIndex = timeSlotsOrder.length - 1;
            }
            
            // Обновляем индикаторы времени
            const timeHeaders = document.querySelectorAll('.time-cell');
            const auditoryCells = document.querySelectorAll('.auditory-cell');
            
            // Убираем все текущие подсветки
            timeHeaders.forEach(el => el.classList.remove('current-time-slot'));
            auditoryCells.forEach(el => el.classList.remove('current-time-slot'));
            
            // Подсвечиваем текущий интервал
            if (currentSlotIndex >= 0 && currentSlotIndex < timeHeaders.length) {
                timeHeaders[currentSlotIndex].classList.add('current-time-slot');
                
                // Подсвечиваем соответствующие ячейки аудиторий
                const auditoriesToShow = getAuditoriesToShow();
                const startIndex = currentSlotIndex * auditoriesToShow.length;
                for (let i = 0; i < auditoriesToShow.length; i++) {
                    const cellIndex = startIndex + i;
                    if (cellIndex < auditoryCells.length) {
                        auditoryCells[cellIndex].classList.add('current-time-slot');
                    }
                }
            }
            
            // Обновляем мобильную версию
            const mobileTimeContainers = document.querySelectorAll('.mobile-time-container');
            mobileTimeContainers.forEach(el => el.classList.remove('current-time-slot-mobile'));
            if (currentSlotIndex >= 0 && currentSlotIndex < mobileTimeContainers.length) {
                mobileTimeContainers[currentSlotIndex].classList.add('current-time-slot-mobile');
            }
        }

        function getLessonTypeClass(lessonType, isAnnouncement = false, annSource = null) {
            if (isAnnouncement) {
                // Differentiate announcements from schedule vs user-created
                if (annSource === 'manual') return 'announcement-manual';
                if (annSource === 'schedule') return 'announcement-schedule';
                return 'announcement';
            }
            const typeMap = {
                'ЛК': 'lecture',
                'ПЗ': 'practice',
                'ЛР': 'lab',
                'Экзамен': 'exam',
                'Консультация': 'consultation',
                'Организация': 'organization',
                'Зачет': 'Test',
                'УПз': 'Instpractice',
                'УЛР': 'Instlab',
                'УЛк': 'Instlecture',
                'Канд. экзамен': 'CandExam'
                
            };
            return typeMap[lessonType] || '';
        }

        async function getScheduleForAuditory(auditory, date, weekNumber) {
            const schedule = {};
            const dayName = dayNames[date.getDay()];
            const showAnnouncements = document.getElementById('showAnnouncementsCheckbox').checked;
            
            if (!teachersData || !teacherSchedulesData) return schedule;

            for (const teacher of teachersData) {
                const teacherSchedule = teacherSchedulesData[teacher.urlId] || {};
                
                for (const scheduleType of ['schedules', 'previousSchedules', 'exams']) {
                    let daySchedule = [];
                    // 'exams' is returned as a flat array, not keyed by day name
                    if (scheduleType === 'exams') {
                        daySchedule = teacherSchedule.exams || [];
                    } else {
                        daySchedule = teacherSchedule[scheduleType]?.[dayName] || [];
                    }

                    for (const lesson of daySchedule) {
                        const weekNumbers = lesson?.weekNumber || [];
                        // Нормализуем недели к числам
                        const normalizedWeeks = Array.isArray(weekNumbers)
                            ? weekNumbers.map(w => Number(w)).filter(w => Number.isInteger(w))
                            : [];
                        
                        // Определяем, является ли запись объявлением:
                        // 1) явный флаг announcement
                        // 2) subject == null И subjectFullName == null И note непустой
                        const isAnnouncementForWeek = Boolean(lesson.announcement) || (
                            (lesson.subject == null) && (lesson.subjectFullName == null) && !!(lesson.note && String(lesson.note).trim())
                        );
                        
                        // Если объявления отключены и это объявление, пропускаем
                        if (!showAnnouncements && isAnnouncementForWeek) {
                            continue;
                        }
                        
                        // Сопоставление аудиторий по триммированным строкам
                        const lessonAuditories = Array.isArray(lesson.auditories)
                            ? lesson.auditories.map(a => (a ?? '').trim())
                            : [];
                        const targetAuditory = (auditory ?? '').trim();
                        const isWeekMatch = isAnnouncementForWeek || normalizedWeeks.includes(Number(weekNumber));

                        if (lessonAuditories.length > 0 && lessonAuditories.includes(targetAuditory) && isWeekMatch) {
                            
                                const startDate = parseDate(lesson.startLessonDate);
                            const endDate = parseDate(lesson.endLessonDate);
                            const lessonDate = parseDate(lesson.dateLesson);
                            // Нормализуем выбранную дату к полуночи для корректного включения конечной даты
                            const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                            
                            if ((startDate && endDate && timeInRange(startDate, endDate, normalizedDate)) || 
                                (lessonDate && normalizedDate.toDateString() === lessonDate.toDateString())) {
                                
                                const lessonStartTime = lesson.startLessonTime;
                                const lessonEndTime = lesson.endLessonTime;
                                
                                for (const timeSlot of timeSlotsOrder) {
                                    const [slotStart, slotEnd] = timeSlot.split('—');
                                    
                                    if (isTimeInSlot(lessonStartTime, lessonEndTime, slotStart, slotEnd)) {
                                        if (!schedule[timeSlot]) {
                                            schedule[timeSlot] = [];
                                        }
                                        // Определяем, является ли запись объявлением по тем же правилам
                                        const isAnnouncement = Boolean(lesson.announcement) || (
                                            (lesson.subject == null) && (lesson.subjectFullName == null) && !!(lesson.note && String(lesson.note).trim())
                                        );
                                        
                                        const subjectDisplay = isAnnouncement
                                            ? 'ОБЪЯВЛЕНИЕ'
                                            : ((lesson.subject && lesson.subject.trim()) ? lesson.subject : '');
                                        schedule[timeSlot].push({
                                            subject: subjectDisplay,
                                            type: lesson.lessonTypeAbbrev,
                                            note: lesson.note || null,
                                            startDate: lesson.startLessonDate || null,
                                            endDate: lesson.endLessonDate || null,
                                            dateLesson: lesson.dateLesson || null,
                                            weeks: normalizedWeeks,
                                            teacher: teacher.fio,
                                            teacherUrlId: teacher.urlId,
                                            groups: lesson.studentGroups?.map(g => g.name) || [],
                                            startTime: lessonStartTime,
                                            endTime: lessonEndTime,
                                            isAnnouncement: isAnnouncement,
                                            annSource: isAnnouncement ? 'schedule' : null
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Дедупликация: пройдём по всем timeSlot-ам и уберём явные дубликаты (на всякий случай)
            try {
                for (const ts of Object.keys(schedule)) {
                    const arr = schedule[ts];
                    const seen = new Set();
                    const deduped = [];
                    for (const item of arr) {
                        const sig = lessonSignature(item);
                        if (!seen.has(sig)) {
                            seen.add(sig);
                            deduped.push(item);
                        }
                    }
                    schedule[ts] = deduped;
                }
            } catch (e) { /* ignore */ }

            // Включаем пользовательские объявления из announcement.json
            try {
                const annArr = (window.announcementsPayload && Array.isArray(window.announcementsPayload.announcements)) ? window.announcementsPayload.announcements : [];
                const targetAuditory = (auditory ?? '').trim();
                const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

                for (const lesson of annArr) {
                    // Каждое объявление ожидается в формате, идентичном annObj: startLessonDate DD.MM.YYYY, auditories: ["..."]
                    const lessonAuditories = Array.isArray(lesson.auditories) ? lesson.auditories.map(a => (a ?? '').trim()) : [];
                    if (lessonAuditories.length === 0 || !lessonAuditories.includes(targetAuditory)) continue;

                    // NOTE: manual announcements should be shown regardless of the "showAnnouncements" checkbox

                    const startDate = parseDate(lesson.startLessonDate);
                    const endDate = parseDate(lesson.endLessonDate);
                    const lessonDate = parseDate(lesson.dateLesson);

                    if (!((startDate && endDate && timeInRange(startDate, endDate, normalizedDate)) || (lessonDate && normalizedDate.toDateString() === lessonDate.toDateString()) || (lesson.startLessonDate && normalizedDate.toDateString() === parseDate(lesson.startLessonDate).toDateString()))) {
                        continue;
                    }

                    const lessonStartTime = lesson.startLessonTime;
                    const lessonEndTime = lesson.endLessonTime || lessonStartTime;

                    for (const timeSlot of timeSlotsOrder) {
                        const [slotStart, slotEnd] = timeSlot.split('—');
                        if (isTimeInSlot(lessonStartTime, lessonEndTime, slotStart, slotEnd)) {
                            if (!schedule[timeSlot]) schedule[timeSlot] = [];
                            const subjectLabel = ((lesson.teacher && String(lesson.teacher).trim()) || (lesson.teacherFio && String(lesson.teacherFio).trim())) ? 'ОБЪЯВЛЕНИЕ' : 'ОБЪЯВЛЕНИЕ';
                            const teacherName = lesson.teacher || (lesson.teacherFio || '-');
                            const matchedUrlId = findTeacherUrlIdByFio(teacherName) || null;
                            schedule[timeSlot].push({
                                subject: subjectLabel,
                                type: lesson.lessonTypeAbbrev || null,
                                note: lesson.note || null,
                                startDate: lesson.startLessonDate || null,
                                endDate: lesson.endLessonDate || null,
                                dateLesson: lesson.dateLesson || null,
                                weeks: [],
                                teacher: teacherName,
                                teacherUrlId: matchedUrlId,
                                groups: lesson.studentGroups?.map(g => g.name) || (lesson.studentGroups || []).map(g=>g?.name).filter(Boolean) || [],
                                startTime: lessonStartTime,
                                endTime: lessonEndTime,
                                isAnnouncement: true,
                                annId: lesson._id || null,
                                annSource: 'manual'
                            });
                        }
                    }
                }
            } catch (err) {
                console.warn('Ошибка при обработке announcement.json', err);
            }
            
            // Ещё раз убираем дубликаты после добавления пользовательских объявлений
            try {
                for (const ts of Object.keys(schedule)) {
                    const arr = schedule[ts];
                    const seen = new Set();
                    const deduped = [];
                    for (const item of arr) {
                        const sig = lessonSignature(item);
                        if (!seen.has(sig)) {
                            seen.add(sig);
                            deduped.push(item);
                        }
                    }
                    schedule[ts] = deduped;
                }
            } catch (e) { /* ignore */ }

            return schedule;
        }

        async function updateSchedule(date, weekNumber) {
            if (!weekNumber) {
                console.error('Не удалось определить номер недели');
                return;
            }

            document.getElementById('loading').style.display = 'flex';
            try {
                const schedulesContainer = document.getElementById('schedules');
                schedulesContainer.innerHTML = '';
                
                // Добавляем пустой угол в левый верхний
                const corner = document.createElement('div');
                corner.className = 'header-cell';
                corner.style.gridColumn = '1';
                corner.style.gridRow = '1';
                schedulesContainer.appendChild(corner);
                
                // Добавляем заголовки аудиторий
                const auditoriesToShow = getAuditoriesToShow();
                auditoriesToShow.forEach((auditory, index) => {
                    const header = document.createElement('div');
                    header.className = 'header-cell auditory-header';
                    header.textContent = auditory;
                    header.style.gridColumn = index + 2;
                    header.style.gridRow = '1';
                    schedulesContainer.appendChild(header);
                });
                
                const promises = auditoriesToShow.map(async (auditory) => {
                    const schedule = await getScheduleForAuditory(auditory, date, weekNumber);
                    return { auditory, schedule };
                });
                
                const results = await Promise.all(promises);
                
                // Получаем текущее время
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                // Находим текущий или следующий временной интервал
                let currentSlotIndex = -1;
                const isToday = date.toDateString() === new Date().toDateString();
                
                if (isToday) {
                    // Ищем первый интервал, который еще не начался или в котором мы находимся
                    for (let i = 0; i < timeSlotsOrder.length; i++) {
                        const [start, end] = timeSlotsOrder[i].split('—');
                        const startMinutes = convertToMinutes(start);
                        const endMinutes = convertToMinutes(end);
                        
                        // Если текущее время до начала этого интервала - это наш следующий интервал
                        if (currentMinutes < startMinutes) {
                            currentSlotIndex = i;
                            break;
                        }
                        // Если мы внутри этого интервала
                        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                            currentSlotIndex = i;
                            break;
                        }
                    }
                    
                    // Если все интервалы прошли, выбираем последний
                    if (currentSlotIndex === -1) {
                        currentSlotIndex = timeSlotsOrder.length - 1;
                    }
                }

                // Добавляем строки для каждого временного интервала
                timeSlotsOrder.forEach((timeSlot, timeIndex) => {
                    // Заголовок временного интервала
                    const timeHeader = document.createElement('div');
                    timeHeader.className = 'time-cell';
                    {
                        const [tsStart, tsEnd] = timeSlot.split('—');
                        const startStr = tsStart.trim();
                        const endStr = tsEnd.trim();
                        const startMin = convertToMinutes(startStr);
                        const endMin = convertToMinutes(endStr);
                        let topState = 'upcoming';
                        let bottomState = 'upcoming';
                        if (isToday) {
                            if (currentMinutes < startMin) {
                                topState = 'upcoming';
                                bottomState = 'upcoming';
                            } else if (currentMinutes >= startMin && currentMinutes < endMin) {
                                topState = 'now';
                                bottomState = 'ongoing-end';
                            } else if (currentMinutes >= endMin) {
                                topState = 'past';
                                bottomState = 'past';
                            }
                        }
                        timeHeader.innerHTML = `
                            <div class=\"time-start\">${startStr}</div>
                            <div class=\"time-end\">${endStr}</div>
                            <span class=\"time-dot time-dot-top ${topState}\"></span>
                            <span class=\"time-dot time-dot-bottom ${bottomState}\"></span>
                        `;
                    }
                    timeHeader.style.gridColumn = '1';
                    timeHeader.style.gridRow = timeIndex + 2;
                    
                    // Подсвечиваем текущий/следующий временной интервал
                    if (isToday && timeIndex === currentSlotIndex) {
                        timeHeader.classList.add('current-time-slot');
                    }
                    
                    schedulesContainer.appendChild(timeHeader);
                    
                    // Ячейки для каждой аудитории
                    results.forEach((result, audIndex) => {
                        const cell = document.createElement('div');
                        cell.className = 'auditory-cell';
                        cell.style.gridColumn = audIndex + 2;
                        cell.style.gridRow = timeIndex + 2;
                        
                        // Подсвечиваем текущий/следующий временной интервал
                        if (isToday && timeIndex === currentSlotIndex) {
                            cell.classList.add('current-time-slot');
                        }
                        
                        const [slotStartRaw, slotEndRaw] = timeSlot.split('—');
                        const slotStart = slotStartRaw.trim();
                        const slotEnd = slotEndRaw.trim();
                        const lessons = (result.schedule[timeSlot] || []).filter(lsn => {
                            try {
                                if (!lsn || !lsn.startTime || !lsn.endTime) return false;
                                return isTimeInSlot(lsn.startTime, lsn.endTime, slotStart, slotEnd);
                            } catch (e) { return false; }
                        });
                        if (lessons && lessons.length > 0) {
                            // Сортируем уроки по началу и рендерим все (ранний будет сверху)
                            lessons.sort((a, b) => { try { return convertToMinutes(a.startTime) - convertToMinutes(b.startTime); } catch (e) { return 0; } });
                            lessons.forEach(lesson => {
                                const lessonDiv = document.createElement('div');
                                const typeClass = getLessonTypeClass(lesson.type, lesson.isAnnouncement, lesson.annSource);
                                lessonDiv.className = `lesson ${typeClass}`;

                                const startTime = (lesson.startTime || '').substring(0, 5);
                                const endTime = (lesson.endTime || '').substring(0, 5);
                                const groupsText = (lesson.groups || []).length > 0 
                                    ? (lesson.groups || []).map(g => 
                                        `<a href="https://iis.bsuir.by/schedule/${g}" target="_blank" class="group-link">${g}</a>`
                                      ).join(', ')
                                    : '';

                                const periodHtml = (lesson.dateLesson && lesson.dateLesson.trim())
                                    ? `<div class="lesson-period">Дата: ${lesson.dateLesson}</div>`
                                    : ((lesson.startDate || lesson.endDate)
                                        ? `<div class="lesson-period">Период: с ${lesson.startDate || ''}${(lesson.startDate && lesson.endDate) ? ' по ' : ''}${lesson.endDate || ''}</div>`
                                        : '');
                                const weeksHtml = (lesson.weeks && lesson.weeks.length > 0)
                                    ? `<div class="lesson-weeks">Недели: ${lesson.weeks.join(', ')}</div>`
                                    : '';
                                const resolvedTeacherUrlId = lesson.teacherUrlId || findTeacherUrlIdByFio(lesson.teacher);
                                const teacherUrl = resolvedTeacherUrlId
                                    ? `https://iis.bsuir.by/schedule/${encodeURIComponent(resolvedTeacherUrlId)}`
                                    : `https://iis.bsuir.by/schedule/`;
                                lessonDiv.innerHTML = `
                                    <div class="lesson-time">${startTime}—${endTime}</div>
                                    ${(periodHtml || weeksHtml) ? `<div class="lesson-meta">${periodHtml}${weeksHtml}</div>` : ''}
                                    <div class="lesson-subject">${lesson.subject || ''}${lesson.type ? ` <span class="lesson-type-inline">(${lesson.type})</span>` : ''}</div>
                                    ${groupsText ? `<div class="lesson-groups">${groupsText}</div>` : ''}
                                    <div><a href="${teacherUrl}" target="_blank" rel="noopener" class="teacher-link">${lesson.teacher || ''}</a></div>
                                    ${lesson.note ? `<div class="lesson-note">${lesson.note}</div>` : ''}
                                `;
                                // Toggle meta visibility on time click
                                const desktopMetaEl = lessonDiv.querySelector('.lesson-meta');
                                const desktopTimeEl = lessonDiv.querySelector('.lesson-time');
                                if (desktopMetaEl && desktopTimeEl) {
                                    desktopMetaEl.style.display = 'none';
                                    desktopTimeEl.addEventListener('click', () => {
                                        desktopMetaEl.style.display = (desktopMetaEl.style.display === 'none') ? 'block' : 'none';
                                    });
                                }
                                // If this lesson is an announcement from announcement.json, add edit button (dev only)
                                if (isDevHtml && lesson.isAnnouncement && lesson.annId) {
                                    const editBtn = document.createElement('button');
                                    editBtn.className = 'ann-edit-btn';
                                    editBtn.textContent = '✎';
                                    editBtn.title = 'Редактировать объявление';
                                    editBtn.style.marginLeft = '8px';
                                    editBtn.style.padding = '2px 6px';
                                    editBtn.style.fontSize = '12px';
                                    editBtn.addEventListener('click', (e) => {
                                        e.stopPropagation();
                                        const dateIso = document.getElementById('datePicker') ? document.getElementById('datePicker').value : '';
                                        openAnnouncementModal(result.auditory, timeSlot, dateIso, lesson.annId);
                                    });
                                    lessonDiv.appendChild(editBtn);
                                }
                                cell.appendChild(lessonDiv);
                            });
                        } else {
                            const noLessonDiv = document.createElement('div');
                            noLessonDiv.className = 'lesson no-lesson';
                            // Текст + inline плюс для добавления объявления
                            const textSpan = document.createElement('span');
                            textSpan.textContent = 'Занятий нет';
                            const actionSpan = document.createElement('span');
                            actionSpan.className = 'add-ann-inline';
                            actionSpan.textContent = '  +';
                            actionSpan.title = 'Добавить объявление';
                            actionSpan.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const dateIso = document.getElementById('datePicker') ? document.getElementById('datePicker').value : '';
                                openAnnouncementModal(result.auditory, timeSlot, dateIso);
                            });
                            noLessonDiv.appendChild(textSpan);
                            if (isDevHtml) {
                                noLessonDiv.appendChild(actionSpan);
                            }
                            cell.appendChild(noLessonDiv);
                        }
                        
                        schedulesContainer.appendChild(cell);
                    });
                });
                
                // Если текущее время прошло текущий интервал, подсвечиваем следующий
                if (isToday && currentSlotIndex !== -1) {
                    const [currentStart, currentEnd] = timeSlotsOrder[currentSlotIndex].split('—');
                    const currentEndMinutes = convertToMinutes(currentEnd);
                    
                    if (currentMinutes > currentEndMinutes && currentSlotIndex < timeSlotsOrder.length - 1) {
                        const nextTimeHeaders = schedulesContainer.querySelectorAll(`.time-cell:nth-child(${currentSlotIndex + 3})`);
                        const nextAuditoryCells = schedulesContainer.querySelectorAll(`.auditory-cell:nth-child(${currentSlotIndex + 3})`);
                        
                        nextTimeHeaders.forEach(el => el.classList.add('current-time-slot'));
                        nextAuditoryCells.forEach(el => el.classList.add('current-time-slot'));
                    }
                }

                // Создаем мобильную версию
                createMobileVersion(results, date, weekNumber, isToday, currentSlotIndex);
            } catch (error) {
                console.error('Ошибка при обновлении расписания:', error);
                alert('Произошла ошибка при загрузке расписания');
            } finally {
                document.getElementById('loading').style.display = 'none';
            }
        }

        function createMobileVersion(results, date, weekNumber, isToday, currentSlotIndex) {
            // Удаляем предыдущую мобильную версию, если она есть
            const oldMobileContainer = document.getElementById('mobile-schedules');
            if (oldMobileContainer) {
                oldMobileContainer.remove();
            }

            // Проверяем, нужно ли показывать мобильную версию
            if (window.innerWidth > 768) {
                document.getElementById('schedules-container').style.display = 'block';
                return;
            }

            // Создаем контейнер для мобильной версии
            const mobileContainer = document.createElement('div');
            mobileContainer.id = 'mobile-schedules';
            const rootFragment = document.createDocumentFragment();

            // Предрасчет первых и последних появлений аудитории за день (по всем слотам)
            const auditoryAppearanceMap = new Map(); // auditory -> { firstIndex, lastIndex }
            results.forEach(r => {
                let firstIndex = null;
                let lastIndex = null;
                timeSlotsOrder.forEach((slot, idx) => {
                    const hasLessons = r.schedule[slot] && r.schedule[slot].length > 0;
                    if (hasLessons) {
                        if (firstIndex === null) firstIndex = idx;
                        lastIndex = idx;
                    }
                });
                if (firstIndex !== null) {
                    auditoryAppearanceMap.set(r.auditory, { firstIndex, lastIndex });
                }
            });

            // Для каждого временного интервала
            timeSlotsOrder.forEach((timeSlot, timeIndex) => {
                const timeContainer = document.createElement('div');
                timeContainer.className = 'mobile-time-container';
                
                // Подсвечиваем текущий временной интервал
                if (isToday && timeIndex === currentSlotIndex) {
                    timeContainer.classList.add('current-time-slot-mobile');
                }
                
                // Заголовок времени
                const timeHeader = document.createElement('div');
                timeHeader.className = 'time-cell';
                const displayTime = timeSlot.replace('—', ' - ');
                timeHeader.textContent = displayTime;
                timeContainer.appendChild(timeHeader);
                
                // Контейнер для аудиторий
                const auditoriesContainer = document.createElement('div');
                auditoriesContainer.className = 'mobile-auditories-container';
                const audFrag = document.createDocumentFragment();
                
                // Собираем аудитории с занятиями в этом временном интервале (фильтруем по времени слота)
                const auditoriesWithLessons = results.filter(result => {
                    const slotTimes = timeSlot.split('—');
                    const slotStart = (slotTimes[0] || '').trim();
                    const slotEnd = (slotTimes[1] || '').trim();
                    const lessonsInSlot = (result.schedule[timeSlot] || []).filter(lsn => {
                        try { if (!lsn || !lsn.startTime || !lsn.endTime) return false; return isTimeInSlot(lsn.startTime, lsn.endTime, slotStart, slotEnd); } catch (e) { return false; }
                    });
                    return lessonsInSlot.length > 0;
                });
                
                // Получаем список всех аудиторий для отображения
                const allAuditoriesToShow = getAuditoriesToShow();
                
                // Если есть занятия или включен чекбокс "Показать все кабинеты", показываем аудитории
                if (auditoriesWithLessons.length > 0 || document.getElementById('showAllAuditoriesCheckbox').checked) {
                    // Если включен чекбокс, показываем все аудитории, иначе только с занятиями
                    const auditoriesToDisplay = document.getElementById('showAllAuditoriesCheckbox').checked ? results : auditoriesWithLessons;
                    
                    auditoriesToDisplay.forEach(result => {
                        const auditoryCard = document.createElement('div');
                        auditoryCard.className = 'mobile-auditory-card';
                        
                        // Название аудитории
                        const auditoryName = document.createElement('div');
                        auditoryName.className = 'mobile-auditory-name';
                        let emoji = '';
                        const appearance = auditoryAppearanceMap.get(result.auditory);
                        if (appearance) {
                            if (timeIndex === appearance.firstIndex && timeIndex === appearance.lastIndex) {
                                // Первая и одновременно последняя пара в этой аудитории за день — закрыто (нужно открыть) и закрыть по завершению
                                emoji = ' 🔐🔑';
                            } else if (timeIndex === appearance.firstIndex) {
                                // Первая пара в этой аудитории за день — закрыто (нужно открыть)
                                emoji = ' 🔐';
                            } else if (timeIndex < appearance.lastIndex) {
                                // Продолжаются занятия позже — открыто
                                emoji = ' 🔓';
                            } else if (timeIndex === appearance.lastIndex) {
                                // Последняя пара в этой аудитории за день — закрыть по завершению
                                emoji = ' 🔑';
                            }
                        }
                        // Установим текст заголовка позже, после проверки наличия занятий в слоте
                        auditoryName.textContent = result.auditory;
                        auditoryCard.appendChild(auditoryName);
                        
                        // Занятия в этой аудитории
                        const lessonsInThisSlot = result.schedule[timeSlot] || [];
                        // Добавляем эмодзи только если в этом слоте есть занятия
                        if (lessonsInThisSlot.length > 0) {
                            auditoryName.textContent = result.auditory + emoji;
                        } else {
                            auditoryName.textContent = result.auditory;
                        }
                        if (lessonsInThisSlot.length > 0) {
                            // Если несколько записей в слоте — показываем все, отсортированные по времени начала
                            lessonsInThisSlot.sort((a, b) => { try { return convertToMinutes(a.startTime) - convertToMinutes(b.startTime); } catch (e) { return 0; } });
                            lessonsInThisSlot.forEach(lesson => {
                                const lessonDiv = document.createElement('div');
                                const typeClass = getLessonTypeClass(lesson.type, lesson.isAnnouncement, lesson.annSource);
                                lessonDiv.className = `mobile-lesson ${typeClass}`;
                                const startTime = lesson.startTime ? lesson.startTime.substring(0, 5) : '';
                                const endTime = lesson.endTime ? lesson.endTime.substring(0, 5) : '';
                                const groupsText = (lesson.groups && lesson.groups.length > 0)
                                    ? lesson.groups.map(g => `<a href="https://iis.bsuir.by/schedule/${g}" target="_blank" class="mobile-group-link">${g}</a>`).join(', ')
                                    : '';

                                const periodHtml = (lesson.dateLesson && lesson.dateLesson.trim())
                                    ? `<div class="mobile-lesson-period">Дата: ${lesson.dateLesson}</div>`
                                    : ((lesson.startDate || lesson.endDate)
                                        ? `<div class="mobile-lesson-period">Период: с ${lesson.startDate || ''}${(lesson.startDate && lesson.endDate) ? ' по ' : ''}${lesson.endDate || ''}</div>`
                                        : '');
                                const weeksHtml = (lesson.weeks && lesson.weeks.length > 0)
                                    ? `<div class="mobile-lesson-weeks">Недели: ${lesson.weeks.join(', ')}</div>`
                                    : '';
                                const resolvedMobileTeacherUrlId = lesson.teacherUrlId || findTeacherUrlIdByFio(lesson.teacher);
                                const teacherUrl = resolvedMobileTeacherUrlId
                                    ? `https://iis.bsuir.by/schedule/${encodeURIComponent(resolvedMobileTeacherUrlId)}`
                                    : `https://iis.bsuir.by/schedule/`;

                                lessonDiv.innerHTML = `
                                    <div class="mobile-lesson-time">${startTime}—${endTime}</div>
                                    ${(periodHtml || weeksHtml) ? `<div class="mobile-lesson-meta">${periodHtml}${weeksHtml}</div>` : ''}
                                    <div class="mobile-lesson-subject">${lesson.subject || ''}${lesson.type ? ` <span class="lesson-type-inline">(${lesson.type})</span>` : ''}</div>
                                    ${groupsText ? `<div class="mobile-lesson-groups">${groupsText}</div>` : ''}
                                    <div class="mobile-lesson-teacher"><a href="${teacherUrl}" target="_blank" rel="noopener" class="teacher-link">${lesson.teacher || ''}</a></div>
                                    ${lesson.note ? `<div class="mobile-lesson-note">${lesson.note}</div>` : ''}
                                `;

                                // Toggle meta visibility on time click (mobile)
                                const mobileMetaEl = lessonDiv.querySelector('.mobile-lesson-meta');
                                const mobileTimeEl = lessonDiv.querySelector('.mobile-lesson-time');
                                if (mobileMetaEl && mobileTimeEl) {
                                    mobileMetaEl.style.display = 'none';
                                    mobileTimeEl.addEventListener('click', () => {
                                        mobileMetaEl.style.display = (mobileMetaEl.style.display === 'none') ? 'block' : 'none';
                                    });
                                }

                                auditoryCard.appendChild(lessonDiv);
                            });
                        } else {
                            // Если занятий нет, но чекбокс "Показать все кабинеты" включен, показываем сообщение с кнопкой
                            const noLessonDiv = document.createElement('div');
                            noLessonDiv.className = 'mobile-lesson no-lesson';
                            const t = document.createElement('div');
                            t.textContent = 'Занятий нет';
                            const actionSpan = document.createElement('span');
                            actionSpan.className = 'add-ann-inline';
                            actionSpan.textContent = '  +';
                            actionSpan.title = 'Добавить объявление';
                            actionSpan.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const dateIso = document.getElementById('datePicker') ? document.getElementById('datePicker').value : '';
                                openAnnouncementModal(result.auditory, timeSlot, dateIso);
                            });
                            noLessonDiv.appendChild(t);
                            if (isDevHtml) {
                                noLessonDiv.appendChild(actionSpan);
                            }
                            auditoryCard.appendChild(noLessonDiv);
                        }
                        
                        audFrag.appendChild(auditoryCard);
                    });
                    auditoriesContainer.appendChild(audFrag);
                } else if (!document.getElementById('showAllAuditoriesCheckbox').checked) {
                    // Показываем "Занятий нет" только если чекбокс "Показать все кабинеты" не включен
                    const noLessons = document.createElement('div');
                    noLessons.className = 'mobile-auditory-card';
                    const t = document.createElement('div');
                    t.textContent = 'Занятий нет';
                    const actionSpan = document.createElement('span');
                    actionSpan.className = 'add-ann-inline';
                    actionSpan.textContent = '  +';
                    actionSpan.title = 'Добавить объявление';
                    actionSpan.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const dateIso = document.getElementById('datePicker') ? document.getElementById('datePicker').value : '';
                        openAnnouncementModal(allAuditoriesToShow[0] || '', timeSlot, dateIso);
                    });
                    noLessons.appendChild(t);
                    if (isDevHtml) {
                        noLessons.appendChild(actionSpan);
                    }
                    audFrag.appendChild(noLessons);
                    auditoriesContainer.appendChild(audFrag);
                }
                
                timeContainer.appendChild(auditoriesContainer);
                rootFragment.appendChild(timeContainer);
            });
            mobileContainer.appendChild(rootFragment);
            
            // Прячем основную таблицу и показываем мобильную версию
            document.getElementById('schedules-container').style.display = 'none';
            document.getElementById('schedules-container').parentNode.insertBefore(mobileContainer, document.getElementById('schedules-container').nextSibling);
        }

        // Обработчик изменения размера окна — перерисовываем ТОЛЬКО при смене брейкпоинта (mobile/desktop)
        window.addEventListener('resize', function() {
            const nowIsMobile = window.innerWidth <= 768;
            if (nowIsMobile === lastIsMobile) return;
            lastIsMobile = nowIsMobile;
            if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                const selectedDate = new Date(document.getElementById('datePicker').value);
                const weekNumber = calculateWeekNumber(selectedDate);
                updateSchedule(selectedDate, weekNumber);
            }
        });

        // Инициализация при загрузке страницы
        document.addEventListener('DOMContentLoaded', () => {
            loadInitialData();
            
            // Запускаем таймер обновления индикаторов времени
            updateTimeDots(); // Первое обновление сразу
            timeUpdateTimer = setInterval(updateTimeDots, 60000); // Каждую минуту
            
            // Обработчик изменения даты
            document.getElementById('datePicker').addEventListener('change', async (e) => {
                const selectedDate = new Date(e.target.value);
                selectedDate.setHours(0, 0, 0, 0);
                
                const weekNumber = calculateWeekNumber(selectedDate);
                const dayName = dayNames[selectedDate.getDay()]; 
                document.getElementById('weekDisplay').textContent = `${selectedDate.toLocaleDateString()} (${dayName}), ${weekNumber}-я учебная неделя`;
                
                await updateSchedule(selectedDate, weekNumber);
            });
            
            // Обработчик изменения чекбокса 602-2 к.
            document.getElementById('show602Checkbox').addEventListener('change', async () => {
                if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                    const selectedDate = new Date(document.getElementById('datePicker').value);
                    const weekNumber = calculateWeekNumber(selectedDate);
                    await updateSchedule(selectedDate, weekNumber);
                }
            });
            
            // Обработчик изменения чекбокса "Показать все кабинеты"
            document.getElementById('showAllAuditoriesCheckbox').addEventListener('change', async () => {
                if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                    const selectedDate = new Date(document.getElementById('datePicker').value);
                    const weekNumber = calculateWeekNumber(selectedDate);
                    await updateSchedule(selectedDate, weekNumber);
                }
            });
            
            // Обработчик изменения чекбокса "Объявления"
            document.getElementById('showAnnouncementsCheckbox').addEventListener('change', async () => {
                if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                    const selectedDate = new Date(document.getElementById('datePicker').value);
                    const weekNumber = calculateWeekNumber(selectedDate);
                    await updateSchedule(selectedDate, weekNumber);
                }
            });

            // Кнопки экспорт/импорт объявлений
            const exportBtn = document.getElementById('exportAnnouncementsBtn');
            if (exportBtn) exportBtn.addEventListener('click', openExportModal);
            const importBtn = document.getElementById('importAnnouncementsBtn');
            if (importBtn) importBtn.addEventListener('click', () => document.getElementById('annFileInput').click());
            const fileInput = document.getElementById('annFileInput');
            if (fileInput) fileInput.addEventListener('change', (e) => handleAnnFileUpload(e.target));
            const downloadBtn = document.getElementById('downloadAnnouncementsBtn');
            if (downloadBtn) downloadBtn.addEventListener('click', (e) => {
                try {
                    downloadAnnouncementsFile();
                } catch (err) {
                    console.error('Ошибка при скачивании объявления:', err);
                }
                // Откроем страницу загрузки репозитория после короткой паузы,
                // чтобы сначала успел сработать диалог сохранения/скачивания.
                setTimeout(() => {
                    window.open('https://github.com/Bzrkr/raspisanieoffline/upload/main', '_blank', 'noopener');
                }, 250);
            });
        // Обработчики для кнопок переключения дней
document.getElementById('prevDayBtn').addEventListener('click', () => {
    const datePicker = document.getElementById('datePicker');
    const currentDate = new Date(datePicker.value);
    currentDate.setDate(currentDate.getDate() - 1);
    
    // Форматируем дату обратно в формат YYYY-MM-DD
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    const newDateStr = `${yyyy}-${mm}-${dd}`;
    
    datePicker.value = newDateStr;
    
    // Триггерим событие change
    datePicker.dispatchEvent(new Event('change'));
});

document.getElementById('nextDayBtn').addEventListener('click', () => {
    const datePicker = document.getElementById('datePicker');
    const currentDate = new Date(datePicker.value);
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Форматируем дату обратно в формат YYYY-MM-DD
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    const newDateStr = `${yyyy}-${mm}-${dd}`;
    
    datePicker.value = newDateStr;
    
    // Триггерим событие change
    datePicker.dispatchEvent(new Event('change'));
});

// Очистка таймера при выгрузке страницы
window.addEventListener('beforeunload', () => {
    if (timeUpdateTimer) {
        clearInterval(timeUpdateTimer);
        timeUpdateTimer = null;
    }
});
});
