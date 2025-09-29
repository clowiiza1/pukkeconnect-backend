/**
 * Synchronise the denormalised string[] interests on student_profile based on
 * the current student_interest join records. Returns the join records (with interest names)
 * ordered alphabetically for convenience in API responses.
 */
export async function syncStudentProfileInterests(client, studentId) {
  const joinRows = await client.student_interest.findMany({
    where: { student_id: studentId },
    include: { interest: { select: { interest_id: true, name: true } } },
    orderBy: { interest: { name: 'asc' } },
  });

  const interestNames = joinRows.map((row) => row.interest.name);
  await client.student_profile.upsert({
    where: { student_id: studentId },
    update: { interests: interestNames, updated_at: new Date() },
    create: { student_id: studentId, interests: interestNames },
  });

  return joinRows;
}
