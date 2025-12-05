const fs = require('fs');
const { exec } = require('child_process');
const readline = require('readline');
const https = require('https');
const path = require('path');

// Function to load .env file manually since we don't have 'dotenv'
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
                process.env[key] = value;
            }
        });
    }
}

loadEnv();

// Configuration
const SITE_ID = process.env.NETLIFY_SITE_ID;
const AUTH_TOKEN = process.env.NETLIFY_AUTH_TOKEN;

// Console Colors
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m"
};

if (!AUTH_TOKEN) {
    console.error(`${colors.red}Error: NETLIFY_AUTH_TOKEN environment variable is not set.${colors.reset}`);
    console.log(`Please set it in your session before running this script.`);
    console.log(`Example (PowerShell): $env:NETLIFY_AUTH_TOKEN="your-personal-access-token"`);
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function runCommand(command) {
    return new Promise((resolve, reject) => {
        console.log(`${colors.cyan}> ${command}${colors.reset}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`${colors.red}${stderr}${colors.reset}`);
                reject(error);
                return;
            }
            if (stdout) console.log(stdout.trim());
            resolve(stdout);
        });
    });
}

function triggerNetlifyDeploy() {
    return new Promise((resolve, reject) => {
        console.log(`${colors.yellow}Triggering Netlify Build...${colors.reset}`);
        
        const options = {
            hostname: 'api.netlify.com',
            path: `/api/v1/sites/${SITE_ID}/builds`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'MyAppDeployScript/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`${colors.green}Deployment triggered successfully!${colors.reset}`);
                    resolve(data);
                } else {
                    console.error(`${colors.red}Failed to trigger deployment. Status: ${res.statusCode}${colors.reset}`);
                    console.error(data);
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (e) => {
            console.error(`${colors.red}Request error: ${e.message}${colors.reset}`);
            reject(e);
        });

        req.write(JSON.stringify({})); // Empty body
        req.end();
    });
}

async function main() {
    try {
        // 1. Prompt for commit message
        const commitMessage = await new Promise(resolve => {
            rl.question(`${colors.yellow}Enter commit message: ${colors.reset}`, (answer) => {
                resolve(answer || "update"); // Default to "update" if empty
            });
        });
        rl.close();

        // 2. Git Add
        await runCommand('git add .');

        // 3. Git Commit
        await runCommand(`git commit -m "${commitMessage}"`);

        // 4. Git Push
        await runCommand('git push');

        // 5. Netlify API Trigger
        await triggerNetlifyDeploy();

        console.log(`${colors.green}All done!${colors.reset}`);

    } catch (error) {
        console.error(`${colors.red}Script failed.${colors.reset}`);
        process.exit(1);
    }
}

main();
