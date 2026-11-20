import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const SUBJECT_CODES = {
  'Agricultural Science': 'AGR',
  'Basic Science': 'BSC',
  'Basic Technology': 'BTC',
  Biology: 'BIO',
  'Business Studies': 'BUS',
  Chemistry: 'CHM',
  'Christian Religious Studies': 'CRS',
  'Civic Education': 'CIV',
  Commerce: 'COM',
  'Computer Studies': 'CMP',
  'Data Processing': 'DPR',
  Economics: 'ECN',
  'English Language': 'ENG',
  'Financial Accounting': 'ACC',
  'Fine Arts': 'ART',
  French: 'FRN',
  'Further Mathematics': 'FMT',
  Geography: 'GEO',
  Government: 'GOV',
  Hausa: 'HAU',
  History: 'HIS',
  'Home Economics': 'HEC',
  Igbo: 'IGB',
  'Islamic Religious Studies': 'IRS',
  'Literature-in-English': 'LIT',
  Mathematics: 'MTH',
  'Physical & Health Education': 'PHE',
  Physics: 'PHY',
  'Social Studies': 'SOS',
  'Technical Drawing': 'TDR',
  Yoruba: 'YOR',
}

function runConvex(fn, args = {}) {
  const out = execFileSync('npx', ['convex', 'run', fn, JSON.stringify(args)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return JSON.parse(out.trim())
}

const dataset = JSON.parse(readFileSync('scripts/nigerian_secondary_school_dataset.json', 'utf8'))

console.log('1. Resetting sample school data (preserving admin accounts)...')
let totalDeleted = 0
let preservedAdmins = 0
while (true) {
  const resetRes = runConvex('importDataset:resetSchoolPreserveAdmins')
  totalDeleted += resetRes.deletedRows
  preservedAdmins = resetRes.preservedAdmins
  if (resetRes.done) break
}
console.log('   Reset:', { deletedRows: totalDeleted, preservedAdmins })

const levels = [...new Set(dataset.classrooms.filter((c) => c.level).map((c) => c.level))]
const subjectNames = [
  ...new Set([
    ...dataset.teachers.flatMap((t) => t.subjects_taught ?? []),
    ...dataset.students.flatMap((s) => s.subjects_offered ?? []),
  ]),
].sort()

const subjects = subjectNames.map((name) => ({
  name,
  code: SUBJECT_CODES[name] ?? name.slice(0, 3).toUpperCase(),
}))

console.log('2. Importing academic year, terms, levels, classrooms, subjects, periods, grading scale...')
const structure = runConvex('importDataset:seedStructure', {
  academicSession: dataset.metadata.academic_session,
  levels,
  classrooms: dataset.classrooms.map((c) => ({
    classroomId: c.classroom_id,
    name: c.name,
    roomType: c.room_type,
    block: c.block,
    ...(c.level ? { level: c.level } : {}),
    capacity: c.capacity,
  })),
  subjects,
})

console.log('3. Importing teachers, non-teaching staff, and guardians...')
const faculty = runConvex('importDataset:seedFacultyAndGuardians', {
  termId: structure.termId,
  subjectByName: structure.subjectByName,
  sectionIdsByLevel: structure.sectionIdsByLevel,
  teachers: dataset.teachers.map((t) => ({
    fullName: `${t.title} ${t.first_name} ${t.last_name}`.trim(),
    email: t.school_email,
    specialization: `${t.department} · ${t.subjects_taught.join(', ')}`,
    subjectsTaught: t.subjects_taught,
    levelsTaught: t.levels_taught,
  })),
  staff: dataset.non_teaching_staff.map((s) => ({
    fullName: `${s.title} ${s.first_name} ${s.last_name}`.trim(),
    email: s.school_email ?? `${s.staff_id.toLowerCase()}@crestviewacademy.edu.ng`,
    jobTitle: s.role,
    department: s.department,
  })),
  guardians: dataset.guardians.map((g) => ({
    guardianId: g.guardian_id,
    fullName: `${g.title} ${g.first_name} ${g.last_name}`.trim(),
    email: g.email,
  })),
})
console.log('   Faculty & guardians:', {
  teachers: faculty.teachersInserted,
  staff: faculty.staffInserted,
  guardians: faculty.guardiansInserted,
  teachingAssignments: faculty.assignmentCount,
})

console.log('4. Importing students in batches of 60...')
const students = dataset.students.map((s) => ({
  fullName: [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' '),
  email: `${s.student_id.toLowerCase()}@crestviewacademy.edu.ng`,
  dateOfBirth: s.date_of_birth,
  classroomId: s.classroom_id,
  guardianId: s.guardian_id,
  subjectsOffered: s.subjects_offered,
}))

let totalStudents = 0
let totalSubjectEnrollments = 0
for (let i = 0; i < students.length; i += 60) {
  const batch = students.slice(i, i + 60)
  const res = runConvex('importDataset:seedStudentBatch', {
    yearId: structure.yearId,
    termId: structure.termId,
    sectionByClassroomId: structure.sectionByClassroomId,
    subjectByName: structure.subjectByName,
    guardianUserByExternalId: faculty.guardianUserByExternalId,
    students: batch,
  })
  totalStudents += res.studentsInserted
  totalSubjectEnrollments += res.subjectEnrollments
  console.log(`   Batch ${Math.floor(i / 60) + 1}: ${res.studentsInserted} students, ${res.subjectEnrollments} subject enrollments`)
}

console.log('5. Linking homeroom form teachers...')
const teacherEmailById = new Map(dataset.teachers.map((t) => [t.teacher_id, t.school_email]))
const formTeacherAssignments = dataset.classrooms
  .filter((c) => c.room_type === 'homeroom' && c.form_teacher_id && teacherEmailById.has(c.form_teacher_id))
  .map((c) => ({
    sectionName: c.name,
    teacherEmail: teacherEmailById.get(c.form_teacher_id),
  }))
const formRes = runConvex('importDataset:seedFormTeachers', { assignments: formTeacherAssignments })
console.log('   Form teachers linked:', formRes.linked)

console.log('Done!', { totalStudents, totalSubjectEnrollments, formTeachersLinked: formRes.linked })
