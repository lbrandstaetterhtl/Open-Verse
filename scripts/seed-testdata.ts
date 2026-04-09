import { db } from '../server/db';
import { users, communities, communityMembers, themes } from '../shared/schema';
import bcrypt from 'bcrypt';
import { eq, inArray } from 'drizzle-orm';

async function seedTestData() {
  console.log('🌱 Starte Testdaten-Seed für Open-Verse...\n');

  try {
    // ==========================================
    // USERS
    // ==========================================
    console.log('👤 Erstelle Test-User...');

    // User 1: Jonas Weber
    const existingJonas = await db
      .select()
      .from(users)
      .where(eq(users.email, 'jonas.weber@example.com'))
      .get();

    let jonasId: number;
    if (existingJonas) {
      console.log(`  ✓ Jonas Weber existiert bereits (ID: ${existingJonas.id})`);
      jonasId = existingJonas.id;
    } else {
      const hashedPassword1 = await bcrypt.hash('TestUser123!', 12);
      const jonas = await db.insert(users).values({
        username: 'jonas_weber',
        email: 'jonas.weber@example.com',
        password: hashedPassword1,
        role: 'user',
        isAdmin: 0 as any,
        karma: 50,
        verified: 1 as any,
        emailVerified: 1 as any,
        bio: 'Ich liebe es Diskussionen zu führen und neue Perspektiven zu entdecken.',
      }).returning({ id: users.id });
      jonasId = jonas[0].id;
      
      if (!jonasId) throw new Error("jonasId is undefined after insert: " + JSON.stringify(jonas));
      console.log(`  ✅ Jonas Weber erstellt (ID: ${jonasId})`);

      // Default Theme for Jonas (Light Theme approximation)
      await db.insert(themes).values({
        userId: jonasId,
        name: 'Light Theme',
        colors: JSON.stringify({
           light: { primary: "215 70% 50%" },
           dark: { primary: "217 91% 60%" }
        })
      });
    }

    // User 2: Sarah Müller
    const existingSarah = await db
      .select()
      .from(users)
      .where(eq(users.email, 'sarah.mueller@example.com'))
      .get();

    let sarahId: number;
    if (existingSarah) {
      console.log(`  ✓ Sarah Müller existiert bereits (ID: ${existingSarah.id})`);
      sarahId = existingSarah.id;
    } else {
      const hashedPassword2 = await bcrypt.hash('TestUser456!', 12);
      const sarah = await db.insert(users).values({
        username: 'sarah_mueller',
        email: 'sarah.mueller@example.com',
        password: hashedPassword2,
        role: 'user',
        isAdmin: 0 as any,
        karma: 40,
        verified: 1 as any,
        emailVerified: 1 as any,
        bio: 'Technik-Enthusiastin und Hobby-Fotografin. Immer offen für neue Ideen.',
      }).returning({ id: users.id });
      sarahId = sarah[0].id;
      
      if (!sarahId) throw new Error("sarahId is undefined after insert: " + JSON.stringify(sarah));
      console.log(`  ✅ Sarah Müller erstellt (ID: ${sarahId})`);
      
      // Default Theme for Sarah (Dark Theme approximation)
      await db.insert(themes).values({
        userId: sarahId,
        name: 'Dark Theme',
        colors: JSON.stringify({
           light: { primary: "215 70% 50%" },
           dark: { primary: "217 91% 60%" }
        })
      });
    }

    // ==========================================
    // COMMUNITIES
    // ==========================================
    console.log('\n🏘️  Erstelle Test-Communities...');

    // Community 1: Technologie & Innovation
    const techSlug = 'technologie-innovation';
    const existingTechCommunity = await db
      .select()
      .from(communities)
      .where(eq(communities.slug, techSlug))
      .get();

    let techCommId: number;
    if (existingTechCommunity) {
      console.log(`  ✓ Technologie & Innovation existiert bereits (ID: ${existingTechCommunity.id})`);
      techCommId = existingTechCommunity.id;
    } else {
      const techComm = await db.insert(communities).values({
        name: 'Technologie & Innovation',
        slug: techSlug,
        description: 'Eine Community für alle die sich für neue Technologien, KI, Software und digitale Trends interessieren. Diskutiert aktuelle Entwicklungen und teilt eure Meinungen.',
        creatorId: jonasId,
        allowedCategories: 'technology,news,discussion'
      }).returning({ id: communities.id });
      techCommId = techComm[0].id;
      if (!techCommId) throw new Error("techCommId is undefined after insert: " + JSON.stringify(techComm));
      console.log(`  ✅ Technologie & Innovation erstellt (ID: ${techCommId})`);

      // Creator is auto-member and owner
      await db.insert(communityMembers).values({
        communityId: techCommId,
        userId: jonasId,
        role: 'owner'
      });
    }

    // Community 2: Alltag & Gesellschaft
    const societySlug = 'alltag-gesellschaft';
    const existingSocietyCommunity = await db
      .select()
      .from(communities)
      .where(eq(communities.slug, societySlug))
      .get();

    let societyCommId: number;
    if (existingSocietyCommunity) {
      console.log(`  ✓ Alltag & Gesellschaft existiert bereits (ID: ${existingSocietyCommunity.id})`);
      societyCommId = existingSocietyCommunity.id;
    } else {
      const societyComm = await db.insert(communities).values({
        name: 'Alltag & Gesellschaft',
        slug: societySlug,
        description: 'Hier dreht sich alles um das tägliche Leben, gesellschaftliche Themen und persönliche Erfahrungen. Ein offener Ort für ehrliche Gespräche.',
        creatorId: sarahId,
        allowedCategories: 'general,lifestyle,discussion'
      }).returning({ id: communities.id });
      societyCommId = societyComm[0].id;
      if (!societyCommId) throw new Error("societyCommId is undefined after insert: " + JSON.stringify(societyComm));
      console.log(`  ✅ Alltag & Gesellschaft erstellt (ID: ${societyCommId})`);

      await db.insert(communityMembers).values({
        communityId: societyCommId,
        userId: sarahId,
        role: 'owner'
      });
    }

    // ==========================================
    // MEMBERSHIPS
    // ==========================================
    console.log('\n🤝 Erstelle ausstehende Community-Memberships...');

    // Membership: Sarah in Tech
    const sarahTechMembership = await db.select().from(communityMembers)
      .where(eq(communityMembers.userId, sarahId)).get();
    // Simple manual check via array to avoid full combinatorial setup:
    const memberships = await db.select().from(communityMembers);
    
    const sarahHasTech = memberships.find(m => m.userId === sarahId && m.communityId === techCommId);
    if (!sarahHasTech) {
      await db.insert(communityMembers).values({ communityId: techCommId, userId: sarahId, role: 'member' });
      console.log('  ✅ Sarah ist nun Mitglied in Technologie & Innovation');
    }

    const jonasHasSociety = memberships.find(m => m.userId === jonasId && m.communityId === societyCommId);
    if (!jonasHasSociety) {
      await db.insert(communityMembers).values({ communityId: societyCommId, userId: jonasId, role: 'member' });
      console.log('  ✅ Jonas ist nun Mitglied in Alltag & Gesellschaft');
    }

    console.log('\n✅ Seed erfolgreich abgeschlossen!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Erstellt:');
    console.log('   👤 Jonas Weber     | jonas.weber@example.com     | TestUser123!');
    console.log('   👤 Sarah Müller    | sarah.mueller@example.com   | TestUser456!');
    console.log('   🏘️  Technologie & Innovation');
    console.log('   🏘️  Alltag & Gesellschaft');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Seed fehlgeschlagen:', error);
    process.exit(1);
  }

  process.exit(0);
}

seedTestData();
