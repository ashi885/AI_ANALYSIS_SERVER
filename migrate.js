const Database = require('better-sqlite3');
const db = new Database('./data/management.db');

try {
    db.exec("ALTER TABLE admin_users RENAME COLUMN email TO username");
    console.log("admin_users migration successful");
} catch(e) {
    console.log("admin_users migration skipped:", e.message);
}

try {
    db.exec("ALTER TABLE users RENAME COLUMN email TO username");
    console.log("users migration successful");
} catch(e) {
    console.log("users migration skipped:", e.message);
}

try {
    const adminExists = db.prepare("SELECT id FROM admin_users WHERE username = 'cueadmin'").get();
    if (!adminExists) {
        db.prepare("INSERT OR REPLACE INTO admin_users (username, password, role) VALUES ('cueadmin', 'cuepoint-admin', 'admin')").run();
        console.log("Seeded cueadmin into admin_users.");
    }
} catch(e) {
    console.log(e.message);
}

try {
    const userExists = db.prepare("SELECT id FROM users WHERE username = 'cueadmin'").get();
    if (!userExists) {
        db.prepare("INSERT INTO users (username, password, role) VALUES ('cueadmin', 'cuepoint-admin', 'ADMIN')").run();
        db.prepare("INSERT INTO users (username, password, role) VALUES ('cueuser', 'cuepoint-user', 'USER')").run();
        console.log("Seeded cueadmin and cueuser into users.");
    }
} catch(e) {
    console.log(e.message);
}
