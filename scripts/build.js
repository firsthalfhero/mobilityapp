const fs = require('fs');
const path = require('path');

console.log('Starting configuration build...');

const templatePath = path.join(__dirname, '..', 'js', 'config.template.js');
const configPath = path.join(__dirname, '..', 'js', 'config.js');

// Check if template file exists
if (!fs.existsSync(templatePath)) {
  console.error('Error: config.template.js not found!');
  process.exit(1);
}

// Read the template file
let templateContent = fs.readFileSync(templatePath, 'utf8');
console.log('Read config.template.js successfully.');

// Define placeholders and corresponding environment variables
const replacements = {
  '__API_KEY__': process.env.API_KEY,
  '__AUTH_DOMAIN__': process.env.AUTH_DOMAIN,
  '__PROJECT_ID__': process.env.PROJECT_ID,
  '__STORAGE_BUCKET__': process.env.STORAGE_BUCKET,
  '__MESSAGING_SENDER_ID__': process.env.MESSAGING_SENDER_ID,
  '__APP_ID__': process.env.APP_ID,
  '__MEASUREMENT_ID__': process.env.MEASUREMENT_ID,
};

// Replace placeholders
for (const [placeholder, value] of Object.entries(replacements)) {
  if (!value) {
    console.error(`Error: Environment variable for ${placeholder} is not set in Netlify.`);
    process.exit(1); // Exit with an error code
  }
  // Use a RegExp for global replacement
  templateContent = templateContent.replace(new RegExp(placeholder, 'g'), value);
}

console.log('Replaced all placeholders.');

// Write the final config file
fs.writeFileSync(configPath, templateContent);

console.log('Successfully created js/config.js.');
