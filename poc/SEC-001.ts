
import http from 'http';

function fetch(path: string) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 5000,
            path: path,
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    try {
        console.log('[*] Fetching post list...');
        const posts: any = await fetch('/api/posts');

        if (!Array.isArray(posts) || posts.length === 0) {
            console.log('[-] No posts found to test.');
            return;
        }

        const targetId = posts[0].id;
        console.log(`[*] Testing Detail View for Post ID: ${targetId}`);

        const detail: any = await fetch(`/api/posts/${targetId}`);

        if (detail && detail.author && detail.author.password) {
            console.log('[+] VULNERABILITY CONFIRMED: Password hash leaked in detail view!');
            console.log('User:', detail.author.username);
            console.log('Hash Leaked:', detail.author.password);
            process.exit(1);
        } else {
            console.log('[-] Detail view appears safe.');
            if (detail && detail.author) {
                console.log('Author object keys:', Object.keys(detail.author));
            }
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
