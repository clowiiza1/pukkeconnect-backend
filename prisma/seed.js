import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('Pa$$w0rd', 10);

async function main() {
  // Upsert uses a UNIQUE field in `where` (email is unique in your schema)
  await prisma.app_user.upsert({
    where: { email: '1234567@mynwu.ac.za' },
    update: {
      // you can set fields here if you want to update existing rows
      major: 'Computer Science',
      campus: 'Mafikeng', // only if campus is an enum; otherwise it's a String
    },
    create: {
      role: 'student',
      email: '1234567@mynwu.ac.za',
      phone_number: '0720000000',   // use Prisma field name from your model; if it shows phoneNumber, use that
      first_name: 'Ella',
      last_name: 'Brown',
      password_hash: hash,
      university_number: '1234567',
      major: 'Computer Science',
      campus: 'Mafikeng',           // matches enum value ("Mafikeng, Potchefstroom, Vanderbijlpark")
    },
  });

  console.log('Seeded demo user.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
