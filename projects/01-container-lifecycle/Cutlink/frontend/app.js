document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const customInput = document.getElementById('customInput');
    const shortenBtn = document.getElementById('shortenBtn');
    const result = document.getElementById('result');
    const shortUrl = document.getElementById('shortUrl');
    const error = document.getElementById('error');
    const copyBtn = document.getElementById('copyBtn');
    const urlList = document.getElementById('urlList');

    shortenBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            showError('Please enter a URL');
            return;
        }
        shortenBtn.disabled = true;
        shortenBtn.textContent = 'Shortening...';
        hideError();
        result.classList.add('hidden');

        const body = { url };
        const custom = customInput.value.trim();
        if (custom) body.custom_code = custom;

        try {
            const res = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                showError(data.error || 'Something went wrong');
                return;
            }
            shortUrl.href = data.short_url;
            shortUrl.textContent = data.short_url;
            result.classList.remove('hidden');
            urlInput.value = '';
            customInput.value = '';
            loadUrls();
        } catch (e) {
            showError('Network error. Is the backend running?');
        } finally {
            shortenBtn.disabled = false;
            shortenBtn.textContent = 'Shorten';
        }
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(shortUrl.href);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });

    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') shortenBtn.click();
    });

    async function loadUrls() {
        try {
            const res = await fetch('/api/urls');
            const data = await res.json();
            if (!data.urls || data.urls.length === 0) {
                urlList.innerHTML = '<p class="loading">No URLs yet. Create one above!</p>';
                return;
            }
            urlList.innerHTML = data.urls.map(u => `
                <div class="url-item">
                    <div>
                        <div class="code">${u.short_code}</div>
                        <small>${u.original_url.substring(0, 50)}${u.original_url.length > 50 ? '...' : ''}</small>
                    </div>
                    <div class="clicks">${u.click_count} clicks</div>
                </div>
            `).join('');
        } catch (e) {
            urlList.innerHTML = '<p class="loading">Could not load URLs.</p>';
        }
    }

    async function loadHealth() {
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            document.getElementById('apiStatus').textContent = data.status === 'healthy' ? 'Up' : 'Degraded';
            document.getElementById('apiStatus').className = `status ${data.database === 'up' && data.redis === 'up' ? 'up' : 'down'}`;
            document.getElementById('dbStatus').textContent = data.database === 'up' ? 'Up' : 'Down';
            document.getElementById('dbStatus').className = `status ${data.database === 'up' ? 'up' : 'down'}`;
            document.getElementById('redisStatus').textContent = data.redis === 'up' ? 'Up' : 'Down';
            document.getElementById('redisStatus').className = `status ${data.redis === 'up' ? 'up' : 'down'}`;
        } catch (e) {
            document.getElementById('apiStatus').textContent = 'Down';
            document.getElementById('apiStatus').className = 'status down';
        }
    }

    function showError(msg) {
        error.textContent = msg;
        error.classList.remove('hidden');
    }

    function hideError() {
        error.classList.add('hidden');
    }

    loadUrls();
    loadHealth();
    setInterval(loadHealth, 15000);
});
