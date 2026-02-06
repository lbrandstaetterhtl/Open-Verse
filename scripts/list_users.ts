
import { storage } from "../server/storage";

async function main() {
    try {
        const users = await storage.getUsers(); // We added getUsers for admin, reusing it
        console.log("Found users:", users.length);
        users.forEach(u => {
            console.log(`ID: ${u.id}, Username: ${u.username}, Role: ${u.role}, IsAdmin: ${u.isAdmin}`);
        });
    } catch (err) {
        console.error("Error listing users:", err);
    }
}

main();
