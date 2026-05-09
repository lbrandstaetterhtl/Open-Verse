/**
 * 🌌 Osiris Functionality Verification Script
 * 
 * Dieses Skript überprüft die Kernfunktionen der Osiris-Plattform auf Code-Ebene.
 * Es testet den Storage-Layer (DatabaseStorage) und stellt sicher, dass 
 * Datenbankoperationen wie User-Erstellung, Posts und Communities korrekt funktionieren.
 */

import { storage } from '../server/storage';
import { db } from '../server/db';
import { users, posts, communities, communityMembers } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function verifyFunctions() {
  console.log('🚀 Starte Funktionsüberprüfung für Osiris...\n');

  const testUsername = `testuser_${Date.now()}`;
  const testEmail = `test_${Date.now()}@example.com`;
  let testUserId: number;
  let testPostId: number;
  let testCommunityId: number;

  try {
    // 1. Authentifizierungs-Logik (User Erstellung)
    console.log('📝 Schritt 1: Überprüfe User-Registrierung...');
    const user = await storage.createUser({
      username: testUsername,
      email: testEmail,
      password: 'HashedPassword123!', // Im echten Flow wird hier ein Hash übergeben
    });

    if (user && user.id) {
      testUserId = user.id;
      console.log(`   ✅ User erfolgreich erstellt (ID: ${testUserId}, Username: ${user.username})`);
    } else {
      throw new Error('User konnte nicht erstellt werden');
    }

    // 2. User Abruf
    console.log('🔍 Schritt 2: Überprüfe User-Abruf...');
    const fetchedUser = await storage.getUserByUsername(testUsername);
    if (fetchedUser && fetchedUser.id === testUserId) {
      console.log('   ✅ User erfolgreich über Username gefunden');
    } else {
      throw new Error('User-Abruf fehlgeschlagen');
    }

    // 3. Post Erstellung
    console.log('📨 Schritt 3: Überprüfe Post-Erstellung...');
    const post = await storage.createPost({
      title: 'Verifikations-Test',
      content: 'Dies ist ein automatisierter Test der Osiris-Kernfunktionen.',
      authorId: testUserId,
      category: 'discussion',
      mediaUrl: null,
      mediaType: null,
      communityId: null,
    });

    if (post && post.id) {
      testPostId = post.id;
      console.log(`   ✅ Post erfolgreich erstellt (ID: ${testPostId})`);
    } else {
      throw new Error('Post-Erstellung fehlgeschlagen');
    }

    // 4. Communities
    console.log('🏘️  Schritt 4: Überprüfe Community-System...');
    const community = await storage.createCommunity({
      name: 'Test Weltraum',
      slug: `test-space-${Date.now()}`,
      description: 'Eine Test-Community für Systemchecks.',
      creatorId: testUserId,
      allowedCategories: 'news,discussion',
    });

    if (community && community.id) {
      testCommunityId = community.id;
      console.log(`   ✅ Community erfolgreich erstellt (ID: ${testCommunityId}, Slug: ${community.slug})`);
    } else {
      throw new Error('Community-Erstellung fehlgeschlagen');
    }

    // 5. Community-Mitgliedschaft
    console.log('🤝 Schritt 5: Überprüfe Community-Mitgliedschaft...');
    const member = await storage.addCommunityMember(testCommunityId, testUserId, 'owner');
    if (member && member.id) {
      console.log('   ✅ Mitgliedschaft erfolgreich registriert');
    } else {
      throw new Error('Mitgliedschaft konnte nicht erstellt werden');
    }

    // 6. Feed-Abruf
    console.log('📱 Schritt 6: Überprüfe Feed-Abruf...');
    const postsInFeed = await storage.getPosts({ limit: 10 });
    if (postsInFeed.length > 0) {
      console.log(`   ✅ Feed erfolgreich geladen (${postsInFeed.length} Posts gefunden)`);
    } else {
      throw new Error('Feed ist leer');
    }

    console.log('\n✨ Alle Kernfunktionen erfolgreich verifiziert!');
    
    // Cleanup (Optional: Test-Daten entfernen um DB sauber zu halten)
    console.log('\n🧹 Bereinige Testdaten...');
    await db.delete(communityMembers).where(eq(communityMembers.communityId, testCommunityId));
    await db.delete(communities).where(eq(communities.id, testCommunityId));
    await db.delete(posts).where(eq(posts.id, testPostId));
    await db.delete(users).where(eq(users.id, testUserId));
    console.log('   ✅ Cleanup abgeschlossen.');

  } catch (error) {
    console.error('\n❌ Funktionsüberprüfung fehlgeschlagen:', error);
    process.exit(1);
  }

  process.exit(0);
}

verifyFunctions();
