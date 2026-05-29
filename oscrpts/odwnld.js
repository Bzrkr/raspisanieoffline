async function fetchJson(url) {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
            return res.json();
        }

        function log(line) {
            const el = document.getElementById('log');
            const time = new Date().toLocaleTimeString();
            el.textContent += `[${time}] ${line}\n`;
            el.scrollTop = el.scrollHeight;
        }

        function setProgress(done, total) {
            const pct = total > 0 ? Math.round(done * 100 / total) : 0;
            document.getElementById('bar').style.width = pct + '%';
            document.getElementById('pct').textContent = pct + '%';
        }

        function saveAsJson(filename, data) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

        // --- Crypto helpers: encrypt JSON with passphrase (AES-GCM + PBKDF2) ---
        // Default passphrase used for encryption when no prompt is desired
        const DEFAULT_PASSPHRASE = 'b23avqbq*Mxf)y#D';
        function arrayBufferToBase64(buffer) {
            let binary = '';
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }

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

        async function startDownload() {
            const btn = document.getElementById('start');
            btn.disabled = true;
            document.getElementById('bar').style.width = '0%';
            document.getElementById('pct').textContent = '0%';
            document.getElementById('log').textContent = '';

            try {
                log('Загружаю список преподавателей...');
                const teachers = await fetchJson('https://iis.bsuir.by/api/v1/employees/all');
                log(`Преподавателей: ${teachers.length}`);

                const total = teachers.length;
                let done = 0;
                setProgress(done, total);

                const schedulesByTeacher = {};

                // Параллельность по батчам для снижения нагрузки
                const batchSize = 10;
                for (let i = 0; i < teachers.length; i += batchSize) {
                    const batch = teachers.slice(i, i + batchSize);
                    await Promise.all(batch.map(async (t) => {
                        try {
                            const sc = await fetchJson(`https://iis.bsuir.by/api/v1/employees/schedule/${t.urlId}`);
                            schedulesByTeacher[t.urlId] = sc;
                            log(`✓ ${t.fio}`);
                        } catch (e) {
                            schedulesByTeacher[t.urlId] = { schedules: {}, previousSchedules: {} };
                            log(`✗ ${t.fio}: ${e.message}`);
                        } finally {
                            done += 1;
                            setProgress(done, total);
                        }
                    }));
                }

                const payload = {
                    generatedAt: new Date().toISOString(),
                    teachers: teachers,
                    teacherSchedules: schedulesByTeacher
                };

                const doEncrypt = document.getElementById('encryptCheckbox').checked;
                if (doEncrypt) {
                    try {
                        log('Шифрую данные с предустановленным паролем...');
                        const wrapped = await encryptObject(payload, DEFAULT_PASSPHRASE);
                        saveAsJson('schedules.json', wrapped);
                        log('Готово. Файл schedules.json сохранён и зашифрован.');
                    } catch (e) {
                        console.error('Ошибка при шифровании:', e);
                        log('Файл не сохранён — ошибка при шифровании.');
                    }
                } else {
                    saveAsJson('schedules.json', payload);
                    log('Готово. Файл schedules.json сохранён ( без шифрования).');
                }
              
            } catch (e) {
                log('Ошибка: ' + e.message);
            } finally {
                btn.disabled = false;
            }
             
                    window.open('https://github.com/Bzrkr/raspisanieoffline/upload/main', '_blank', 'noopener');
              
        }   
