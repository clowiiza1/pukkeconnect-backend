import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('Pa$$w0rd', 10);

async function main() {
  // Upsert demo user
  const demoUser = await prisma.app_user.upsert({
    where: { email: '1234567@mynwu.ac.za' },
    update: {
      major: 'Computer Science',
      campus: 'Mafikeng',
    },
    create: {
      role: 'student',
      email: '1234567@mynwu.ac.za',
      phone_number: '0720000000',
      first_name: 'Ella',
      last_name: 'Brown',
      password_hash: hash,
      university_number: '1234567',
      major: 'Computer Science',
      campus: 'Mafikeng',
    },
  });

  console.log('✓ Seeded demo user:', demoUser.email);

  // Create student profile for demo user if it doesn't exist
  await prisma.student_profile.upsert({
    where: { student_id: demoUser.user_id },
    update: {},
    create: {
      student_id: demoUser.user_id,
      study_field: 'Computer Science',
      interests: [],
    },
  });

  console.log('✓ Created student profile');

  // Seed interests
  const interestsData = [
    'Technology', 'Coding', 'AI & Machine Learning', 'Robotics', 'Web Development',
    'Sports', 'Football', 'Basketball', 'Rugby', 'Athletics',
    'Arts', 'Music', 'Drama', 'Photography', 'Design',
    'Business', 'Entrepreneurship', 'Finance', 'Marketing',
    'Community Service', 'Environment', 'Health & Wellness',
    'Gaming', 'Esports', 'Board Games',
    'Culture', 'Debate', 'Public Speaking', 'Writing'
  ];

  const createdInterests = [];
  for (const name of interestsData) {
    const interest = await prisma.interest.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    createdInterests.push(interest);
  }

  console.log(`✓ Seeded ${createdInterests.length} interests`);

  // Check if matchmaker quiz exists
  const existingQuiz = await prisma.quiz.findFirst({
    where: { society_id: null },
  });

  let quiz;
  if (existingQuiz) {
    console.log('✓ Matchmaker quiz already exists');
    quiz = existingQuiz;
  } else {
    // Create matchmaker quiz (society_id = null for global quiz)
    quiz = await prisma.quiz.create({
      data: {
        society_id: null, // NULL = matchmaker quiz
        title: 'Find Your Perfect Society Match',
        description: 'Answer these questions to discover societies that align with your interests and availability.',
        created_by: demoUser.user_id,
      },
    });
    console.log('✓ Created matchmaker quiz');
  }

  // Skip quiz questions if quiz already existed (avoid duplicates)
  const existingQuestions = await prisma.quiz_question.findMany({
    where: { quiz_id: quiz.quiz_id },
  });

  if (existingQuestions.length > 0) {
    console.log('✓ Quiz questions already exist, skipping question creation');
  } else {
    // Question 1: Interests (multi-choice)
  const q1 = await prisma.quiz_question.create({
    data: {
      quiz_id: quiz.quiz_id,
      prompt: 'Which activities interest you most?',
      kind: 'multi',
    },
  });

  const q1Options = [
    { label: 'Technology & Coding', value: 'tech', interests: ['Technology', 'Coding', 'Web Development'] },
    { label: 'AI & Robotics', value: 'ai', interests: ['AI & Machine Learning', 'Robotics', 'Technology'] },
    { label: 'Sports & Fitness', value: 'sports', interests: ['Sports', 'Football', 'Basketball', 'Health & Wellness'] },
    { label: 'Arts & Culture', value: 'arts', interests: ['Arts', 'Music', 'Drama', 'Photography', 'Design'] },
    { label: 'Business & Entrepreneurship', value: 'business', interests: ['Business', 'Entrepreneurship', 'Finance', 'Marketing'] },
    { label: 'Gaming & Esports', value: 'gaming', interests: ['Gaming', 'Esports', 'Board Games'] },
    { label: 'Community Service', value: 'community', interests: ['Community Service', 'Environment'] },
  ];

  for (const opt of q1Options) {
    const option = await prisma.quiz_option.create({
      data: {
        question_id: q1.question_id,
        label: opt.label,
        value: opt.value,
      },
    });

    // Link options to interests
    for (const interestName of opt.interests) {
      const interest = createdInterests.find(i => i.name === interestName);
      if (interest) {
        await prisma.quiz_option_interest.create({
          data: {
            option_id: option.option_id,
            interest_id: interest.interest_id,
            weight: 15,
          },
        });
      }
    }
  }

  // Question 2: Availability (single-choice)
  const q2 = await prisma.quiz_question.create({
    data: {
      quiz_id: quiz.quiz_id,
      prompt: 'When are you usually available for society activities?',
      kind: 'single',
    },
  });

  await prisma.quiz_option.createMany({
    data: [
      { question_id: q2.question_id, label: 'Weekday mornings', value: 'weekday_morning' },
      { question_id: q2.question_id, label: 'Weekday afternoons', value: 'weekday_afternoon' },
      { question_id: q2.question_id, label: 'Weekday evenings', value: 'weekday_evening' },
      { question_id: q2.question_id, label: 'Weekends', value: 'weekend' },
      { question_id: q2.question_id, label: 'Flexible schedule', value: 'flexible' },
    ],
  });

  // Question 3: Group size preference (single-choice)
  const q3 = await prisma.quiz_question.create({
    data: {
      quiz_id: quiz.quiz_id,
      prompt: 'What size of group do you prefer?',
      kind: 'single',
    },
  });

  await prisma.quiz_option.createMany({
    data: [
      { question_id: q3.question_id, label: 'Small intimate groups (5-15 people)', value: 'small' },
      { question_id: q3.question_id, label: 'Medium groups (15-30 people)', value: 'medium' },
      { question_id: q3.question_id, label: 'Large communities (30+ people)', value: 'large' },
      { question_id: q3.question_id, label: 'No preference', value: 'any' },
    ],
  });

  // Question 4: Goals (multi-choice)
  const q4 = await prisma.quiz_question.create({
    data: {
      quiz_id: quiz.quiz_id,
      prompt: 'What do you hope to gain from joining a society?',
      kind: 'multi',
    },
  });

  const q4Options = [
    { label: 'Learn new skills', value: 'skills', interests: ['Technology', 'Business', 'Arts'] },
    { label: 'Make friends & network', value: 'social', interests: ['Community Service', 'Culture'] },
    { label: 'Career development', value: 'career', interests: ['Business', 'Entrepreneurship', 'Technology'] },
    { label: 'Fun & relaxation', value: 'fun', interests: ['Gaming', 'Sports', 'Arts'] },
    { label: 'Make a difference', value: 'impact', interests: ['Community Service', 'Environment'] },
  ];

  for (const opt of q4Options) {
    const option = await prisma.quiz_option.create({
      data: {
        question_id: q4.question_id,
        label: opt.label,
        value: opt.value,
      },
    });

    for (const interestName of opt.interests) {
      const interest = createdInterests.find(i => i.name === interestName);
      if (interest) {
        await prisma.quiz_option_interest.create({
          data: {
            option_id: option.option_id,
            interest_id: interest.interest_id,
            weight: 10,
          },
        });
      }
    }
  }

    // Question 5: Free text for additional interests
    await prisma.quiz_question.create({
      data: {
        quiz_id: quiz.quiz_id,
        prompt: 'Tell us about any other interests or hobbies you have (optional)',
        kind: 'text',
      },
    });

    console.log('✓ Created quiz questions with options');
  }

  // Seed societies with interests
  const societiesData = [
    {
      name: 'AI & Machine Learning Society',
      description: 'Exploring artificial intelligence, neural networks, and machine learning algorithms through workshops and projects.',
      category: 'Technology',
      campus: 'Potchefstroom',
      interests: ['AI & Machine Learning', 'Technology', 'Coding', 'Robotics']
    },
    {
      name: 'Web Developers Guild',
      description: 'Build amazing web applications using modern frameworks like React, Vue, and Node.js.',
      category: 'Technology',
      campus: 'Mafikeng',
      interests: ['Web Development', 'Technology', 'Coding', 'Design']
    },
    {
      name: 'Robotics Club',
      description: 'Design, build, and program robots for competitions and real-world applications.',
      category: 'Technology',
      campus: 'Vanderbijlpark',
      interests: ['Robotics', 'Technology', 'AI & Machine Learning', 'Coding']
    },
    {
      name: 'NWU Football Club',
      description: 'Competitive football training and inter-campus matches. All skill levels welcome!',
      category: 'Sports',
      campus: 'Potchefstroom',
      interests: ['Football', 'Sports', 'Health & Wellness', 'Athletics']
    },
    {
      name: 'Basketball Society',
      description: 'Weekly training sessions, friendly matches, and tournament participation.',
      category: 'Sports',
      campus: 'Mafikeng',
      interests: ['Basketball', 'Sports', 'Health & Wellness', 'Athletics']
    },
    {
      name: 'Rugby Eagles',
      description: 'Join our proud rugby tradition with professional coaching and competitive play.',
      category: 'Sports',
      campus: 'Vanderbijlpark',
      interests: ['Rugby', 'Sports', 'Health & Wellness', 'Athletics']
    },
    {
      name: 'Athletics & Track Club',
      description: 'Training for sprints, distance running, and field events with certified coaches.',
      category: 'Sports',
      campus: 'Potchefstroom',
      interests: ['Athletics', 'Sports', 'Health & Wellness']
    },
    {
      name: 'Music Society',
      description: 'For musicians of all genres - from classical to contemporary. Jam sessions, concerts, and collaborations.',
      category: 'Arts',
      campus: 'Mafikeng',
      interests: ['Music', 'Arts', 'Culture']
    },
    {
      name: 'Drama & Theatre Club',
      description: 'Perform in plays, musicals, and experimental theatre. Acting workshops included.',
      category: 'Arts',
      campus: 'Potchefstroom',
      interests: ['Drama', 'Arts', 'Culture', 'Public Speaking']
    },
    {
      name: 'Photography Society',
      description: 'Learn photography techniques, participate in photo walks, and showcase your work.',
      category: 'Arts',
      campus: 'Vanderbijlpark',
      interests: ['Photography', 'Arts', 'Design']
    },
    {
      name: 'Design Collective',
      description: 'Graphic design, UI/UX, and digital art. Collaborate on creative projects.',
      category: 'Arts',
      campus: 'Mafikeng',
      interests: ['Design', 'Arts', 'Technology', 'Web Development']
    },
    {
      name: 'Entrepreneurship Hub',
      description: 'Start your business journey with mentorship, pitch nights, and startup workshops.',
      category: 'Business',
      campus: 'Potchefstroom',
      interests: ['Entrepreneurship', 'Business', 'Marketing', 'Finance']
    },
    {
      name: 'Finance & Investment Club',
      description: 'Learn about stocks, crypto, and personal finance through real trading simulations.',
      category: 'Business',
      campus: 'Mafikeng',
      interests: ['Finance', 'Business', 'Entrepreneurship']
    },
    {
      name: 'Marketing Masters',
      description: 'Digital marketing, social media strategy, and brand building workshops.',
      category: 'Business',
      campus: 'Vanderbijlpark',
      interests: ['Marketing', 'Business', 'Entrepreneurship', 'Design']
    },
    {
      name: 'Community Outreach Program',
      description: 'Make a difference through volunteering, tutoring, and community development projects.',
      category: 'Community Service',
      campus: 'Mafikeng',
      interests: ['Community Service', 'Environment', 'Health & Wellness']
    },
    {
      name: 'Environmental Action Group',
      description: 'Sustainability initiatives, tree planting, and environmental advocacy campaigns.',
      category: 'Community Service',
      campus: 'Potchefstroom',
      interests: ['Environment', 'Community Service']
    },
    {
      name: 'Health & Wellness Society',
      description: 'Promote mental and physical health through yoga, meditation, and wellness workshops.',
      category: 'Community Service',
      campus: 'Vanderbijlpark',
      interests: ['Health & Wellness', 'Community Service', 'Sports']
    },
    {
      name: 'Esports Arena',
      description: 'Competitive gaming tournaments in League, Valorant, CS2, and more. Join our esports teams!',
      category: 'Gaming',
      campus: 'Potchefstroom',
      interests: ['Esports', 'Gaming', 'Technology']
    },
    {
      name: 'Board Game Guild',
      description: 'Weekly game nights featuring strategy games, D&D campaigns, and card games.',
      category: 'Gaming',
      campus: 'Mafikeng',
      interests: ['Board Games', 'Gaming', 'Culture']
    },
    {
      name: 'Debate Society',
      description: 'Sharpen your argumentation skills through competitive debates and public speaking.',
      category: 'Culture',
      campus: 'Vanderbijlpark',
      interests: ['Debate', 'Public Speaking', 'Culture']
    },
    {
      name: 'Writers Circle',
      description: 'Creative writing workshops, poetry readings, and publishing opportunities.',
      category: 'Culture',
      campus: 'Mafikeng',
      interests: ['Writing', 'Culture', 'Arts']
    },
    {
      name: 'Public Speaking Club',
      description: 'Develop confidence and presentation skills through Toastmasters-style meetings.',
      category: 'Culture',
      campus: 'Potchefstroom',
      interests: ['Public Speaking', 'Debate', 'Culture', 'Business']
    },
  ];

  console.log('\nSeeding societies...');
  for (const societyData of societiesData) {
    const existingSociety = await prisma.society.findUnique({
      where: { society_name: societyData.name },
    });

    if (existingSociety) {
      console.log(`  ⊙ Society already exists: ${societyData.name}`);
      continue;
    }

    const society = await prisma.society.create({
      data: {
        society_name: societyData.name,
        description: societyData.description,
        category: societyData.category,
        campus: societyData.campus,
        created_by: demoUser.user_id,
      },
    });

    // Link society to interests
    for (const interestName of societyData.interests) {
      const interest = createdInterests.find(i => i.name === interestName);
      if (interest) {
        await prisma.society_interest.create({
          data: {
            society_id: society.society_id,
            interest_id: interest.interest_id,
            weight: 15,
          },
        });
      }
    }

    console.log(`  ✓ Created: ${societyData.name}`);
  }

  console.log('\n✅ Seed completed successfully!');
  console.log('\nYou can now:');
  console.log('1. Login with: 1234567@mynwu.ac.za / Pa$$w0rd');
  console.log('2. Take the matchmaker quiz');
  console.log('3. Get personalized society recommendations\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
