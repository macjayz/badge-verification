const fs = require('fs');
const path = require('path');

console.log('🔍 Checking route imports...\n');

const routesPath = path.join(__dirname, '../src/routes');

// Check if user.routes.ts exists
const userRoutesPath = path.join(routesPath, 'user.routes.ts');
if (fs.existsSync(userRoutesPath)) {
    console.log('✅ user.routes.ts exists');
    
    const content = fs.readFileSync(userRoutesPath, 'utf8');
    
    // Check if it exports a router
    if (content.includes('export default') || content.includes('module.exports')) {
        console.log('✅ user.routes.ts has proper export');
    } else {
        console.log('❌ user.routes.ts missing export');
    }
    
    // Check if UserController is imported
    if (content.includes('UserController')) {
        console.log('✅ UserController is imported');
    } else {
        console.log('❌ UserController not found in imports');
    }
} else {
    console.log('❌ user.routes.ts does not exist');
}

// Check if user.controller.ts exists
const userControllerPath = path.join(__dirname, '../src/controllers/user.controller.ts');
if (fs.existsSync(userControllerPath)) {
    console.log('✅ user.controller.ts exists');
    
    const content = fs.readFileSync(userControllerPath, 'utf8');
    
    // Check if it exports the class
    if (content.includes('export class UserController') || content.includes('export default')) {
        console.log('✅ user.controller.ts has proper export');
    } else {
        console.log('❌ user.controller.ts missing export');
    }
} else {
    console.log('❌ user.controller.ts does not exist');
}

console.log('\n📋 If you see any ❌ above, those need to be fixed.');