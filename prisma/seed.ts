import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clear existing data in correct order (respecting foreign key constraints)
  console.log('Clearing existing data...');
  
  await prisma.checkupAudio.deleteMany();
  await prisma.recommendedLabTest.deleteMany();
  await prisma.medication.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.checkupTestRecommendation.deleteMany();
  await prisma.checkup.deleteMany();
  await prisma.onlineAppointment.deleteMany();
  await prisma.walkinAppointment.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.appointmentSlot.deleteMany();
  await prisma.doctorSchedule.deleteMany();
  await prisma.patientLabTest.deleteMany();
  await prisma.labTest.deleteMany();
  await prisma.labTestTemplate.deleteMany();
  await prisma.drug.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.receptionist.deleteMany();
  await prisma.labTechnician.deleteMany();
  await prisma.pathologist.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.department.deleteMany();
  await prisma.standardDepartment.deleteMany();
  
  console.log('Existing data cleared successfully!');
  console.log('Starting fresh seed...\n');

  // Create roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Hospital Administrator',
    },
  });

  const doctorRole = await prisma.role.upsert({
    where: { name: 'DOCTOR' },
    update: {},
    create: {
      name: 'DOCTOR',
      description: 'Doctor',
    },
  });

  await prisma.role.upsert({
    where: { name: 'PATIENT' },
    update: {},
    create: {
      name: 'PATIENT',
      description: 'Patient',
    },
  });

  await prisma.role.upsert({
    where: { name: 'RECEPTIONIST' },
    update: {},
    create: {
      name: 'RECEPTIONIST',
      description: 'Receptionist',
    },
  });

  // Create standard departments
  const standardDepartments = [
    {
      name: 'Cardiology',
      code: 'CARD',
      description: 'Heart and cardiovascular system',
    },
    {
      name: 'Neurology',
      code: 'NEUR',
      description: 'Brain and nervous system',
    },
    { name: 'Orthopedics', code: 'ORTH', description: 'Bones and joints' },
    { name: 'Pediatrics', code: 'PEDI', description: 'Children healthcare' },
    { name: 'Gynecology', code: 'GYNE', description: 'Women healthcare' },
    { name: 'Radiology', code: 'RADI', description: 'Medical imaging' },
    {
      name: 'General Medicine',
      code: 'GENM',
      description: 'General medical care',
    },
  ];

  for (const dept of standardDepartments) {
    await prisma.standardDepartment.upsert({
      where: { code: dept.code },
      update: {},
      create: dept,
    });
  }

  // Create admin user
  const hashedPassword = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || 'admin123456',
    10,
  );

  const adminUser = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@hospital.com' },
    update: {},
    create: {
      firstName: process.env.ADMIN_FIRST_NAME || 'Hospital',
      lastName: process.env.ADMIN_LAST_NAME || 'Administrator',
      email: process.env.ADMIN_EMAIL || 'admin@hospital.com',
      cnic: process.env.ADMIN_CNIC || '12345-6789012-3',
      password: hashedPassword,
      gender: 'MALE',
    },
  });

  // Assign admin role to admin user
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  // Create a default department (Cardiology)
  const cardiologyStandard = await prisma.standardDepartment.findUnique({
    where: { code: 'CARD' },
  });

  const cardiologyDept = await prisma.department.upsert({
    where: { name: 'Cardiology Department' },
    update: {},
    create: {
      name: 'Cardiology Department',
      description: 'Heart and cardiovascular system department',
      standardDepartmentId: cardiologyStandard!.id,
    },
  });

  // Create more departments
  const neurologyStandard = await prisma.standardDepartment.findUnique({
    where: { code: 'NEUR' },
  });

  const neurologyDept = await prisma.department.upsert({
    where: { name: 'Neurology Department' },
    update: {},
    create: {
      name: 'Neurology Department',
      description: 'Brain and nervous system department',
      standardDepartmentId: neurologyStandard!.id,
    },
  });

  const orthopedicsStandard = await prisma.standardDepartment.findUnique({
    where: { code: 'ORTH' },
  });

  const orthopedicsDept = await prisma.department.upsert({
    where: { name: 'Orthopedics Department' },
    update: {},
    create: {
      name: 'Orthopedics Department',
      description: 'Bones and joints department',
      standardDepartmentId: orthopedicsStandard!.id,
    },
  });

  const pediatricsStandard = await prisma.standardDepartment.findUnique({
    where: { code: 'PEDI' },
  });

  const pediatricsDept = await prisma.department.upsert({
    where: { name: 'Pediatrics Department' },
    update: {},
    create: {
      name: 'Pediatrics Department',
      description: 'Children healthcare department',
      standardDepartmentId: pediatricsStandard!.id,
    },
  });

  const gynecologyStandard = await prisma.standardDepartment.findUnique({
    where: { code: 'GYNE' },
  });

  const gynecologyDept = await prisma.department.upsert({
    where: { name: 'Gynecology Department' },
    update: {},
    create: {
      name: 'Gynecology Department',
      description: 'Women healthcare department',
      standardDepartmentId: gynecologyStandard!.id,
    },
  });

  // Create multiple doctors
  const defaultPassword = await bcrypt.hash(
    process.env.DEFAULT_PASSWORD || 'password123',
    10,
  );

  const doctors = [
    {
      email: 'doctor@hospital.com',
      firstName: 'Dr. Ali',
      lastName: 'Hassan',
      cnic: '42101-2345678-1',
      gender: 'MALE',
      departmentId: cardiologyDept.id,
      licenseNumber: 'PMC-12345',
      specialization: 'Interventional Cardiology',
      experience: 15,
      qualification: 'MBBS, FCPS (Cardiology)',
    },
    {
      email: 'dr.fatima@hospital.com',
      firstName: 'Dr. Fatima',
      lastName: 'Khan',
      cnic: '42201-3456789-2',
      gender: 'FEMALE',
      departmentId: gynecologyDept.id,
      licenseNumber: 'PMC-23456',
      specialization: 'Obstetrics and Gynecology',
      experience: 12,
      qualification: 'MBBS, FCPS (Gynecology)',
    },
    {
      email: 'dr.ahmed@hospital.com',
      firstName: 'Dr. Ahmed',
      lastName: 'Malik',
      cnic: '42301-4567890-3',
      gender: 'MALE',
      departmentId: neurologyDept.id,
      licenseNumber: 'PMC-34567',
      specialization: 'Neurologist',
      experience: 18,
      qualification: 'MBBS, FCPS (Neurology)',
    },
    {
      email: 'dr.sara@hospital.com',
      firstName: 'Dr. Sara',
      lastName: 'Ahmad',
      cnic: '42401-5678901-4',
      gender: 'FEMALE',
      departmentId: pediatricsDept.id,
      licenseNumber: 'PMC-45678',
      specialization: 'Pediatrician',
      experience: 10,
      qualification: 'MBBS, DCH, FCPS (Pediatrics)',
    },
    {
      email: 'dr.usman@hospital.com',
      firstName: 'Dr. Usman',
      lastName: 'Sheikh',
      cnic: '42501-6789012-5',
      gender: 'MALE',
      departmentId: orthopedicsDept.id,
      licenseNumber: 'PMC-56789',
      specialization: 'Orthopedic Surgeon',
      experience: 20,
      qualification: 'MBBS, FCPS (Orthopedics)',
    },
  ];

  for (const doctor of doctors) {
    const doctorUser = await prisma.user.upsert({
      where: { email: doctor.email },
      update: {},
      create: {
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        email: doctor.email,
        cnic: doctor.cnic,
        password: defaultPassword,
        gender: doctor.gender as any,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: doctorUser.id,
          roleId: doctorRole.id,
        },
      },
      update: {},
      create: {
        userId: doctorUser.id,
        roleId: doctorRole.id,
      },
    });

    await prisma.doctor.upsert({
      where: { userId: doctorUser.id },
      update: {},
      create: {
        userId: doctorUser.id,
        departmentId: doctor.departmentId,
        licenseNumber: doctor.licenseNumber,
        specialization: doctor.specialization,
        experience: doctor.experience,
        qualification: doctor.qualification,
      },
    });
  }

  // Get patient role
  const patientRole = await prisma.role.findUnique({
    where: { name: 'PATIENT' },
  });

  // Create multiple patients with varied backgrounds
  const patients = [
    {
      email: 'patient@hospital.com',
      firstName: 'Ahmed',
      lastName: 'Ali',
      cnic: '42101-1234567-8',
      gender: 'MALE',
      dateOfBirth: new Date('1990-05-15'),
      bloodGroup: 'O+',
      phoneNumber: '+92-300-1234567',
      address: 'House 123, Block A, Gulshan-e-Iqbal, Karachi',
      emergencyContact: '+92-300-7654321',
      allergies: 'Penicillin',
      medicalHistory: 'Hypertension diagnosed in 2020',
      familyHistory: 'Father has diabetes, mother has thyroid disorder',
      onboardingDone: true,
    },
    {
      email: 'zainab.hussain@email.com',
      firstName: 'Zainab',
      lastName: 'Hussain',
      cnic: '42201-2345678-9',
      gender: 'FEMALE',
      dateOfBirth: new Date('1985-08-22'),
      bloodGroup: 'A+',
      phoneNumber: '+92-321-2345678',
      address: 'Flat 45, DHA Phase 5, Karachi',
      emergencyContact: '+92-321-8765432',
      allergies: 'None',
      medicalHistory: 'Previous pregnancy complications, cesarean delivery in 2018',
      familyHistory: 'Sister has PCOS',
      onboardingDone: true,
    },
    {
      email: 'bilal.ahmed@email.com',
      firstName: 'Bilal',
      lastName: 'Ahmed',
      cnic: '42301-3456789-0',
      gender: 'MALE',
      dateOfBirth: new Date('1978-12-10'),
      bloodGroup: 'B+',
      phoneNumber: '+92-333-3456789',
      address: 'House 78, Sector F-11, Islamabad',
      emergencyContact: '+92-333-9876543',
      allergies: 'Sulfa drugs, shellfish',
      medicalHistory: 'Type 2 diabetes since 2015, controlled with medication',
      familyHistory: 'Father had heart attack at age 65',
      onboardingDone: true,
    },
    {
      email: 'ayesha.khan@email.com',
      firstName: 'Ayesha',
      lastName: 'Khan',
      cnic: '42401-4567890-1',
      gender: 'FEMALE',
      dateOfBirth: new Date('1995-03-18'),
      bloodGroup: 'AB+',
      phoneNumber: '+92-311-4567890',
      address: 'Apartment 12, Bahria Town Phase 4, Rawalpindi',
      emergencyContact: '+92-311-0987654',
      allergies: 'Latex, pollen',
      medicalHistory: 'Asthma since childhood, uses inhaler',
      familyHistory: 'Mother has asthma',
      onboardingDone: true,
    },
    {
      email: 'hassan.raza@email.com',
      firstName: 'Hassan',
      lastName: 'Raza',
      cnic: '42501-5678901-2',
      gender: 'MALE',
      dateOfBirth: new Date('2000-07-05'),
      bloodGroup: 'O-',
      phoneNumber: '+92-345-5678901',
      address: 'House 234, Model Town, Lahore',
      emergencyContact: '+92-345-1098765',
      allergies: 'None',
      medicalHistory: 'Sports injury - ACL tear in 2022, underwent surgery',
      familyHistory: 'No significant family history',
      onboardingDone: true,
    },
    {
      email: 'sana.malik@email.com',
      firstName: 'Sana',
      lastName: 'Malik',
      cnic: '42601-6789012-3',
      gender: 'FEMALE',
      dateOfBirth: new Date('1988-11-30'),
      bloodGroup: 'A-',
      phoneNumber: '+92-334-6789012',
      address: 'Villa 56, DHA Phase 8, Karachi',
      emergencyContact: '+92-334-2109876',
      allergies: 'Aspirin',
      medicalHistory: 'Migraine headaches, managed with medication',
      familyHistory: 'Mother has migraine history',
      onboardingDone: true,
    },
    {
      email: 'umar.farooq@email.com',
      firstName: 'Umar',
      lastName: 'Farooq',
      cnic: '42701-7890123-4',
      gender: 'MALE',
      dateOfBirth: new Date('1982-04-25'),
      bloodGroup: 'B-',
      phoneNumber: '+92-322-7890123',
      address: 'House 89, Johar Town, Lahore',
      emergencyContact: '+92-322-3210987',
      allergies: 'None',
      medicalHistory: 'High cholesterol, on statin medication',
      familyHistory: 'Father and brother have coronary artery disease',
      onboardingDone: true,
    },
  ];

  for (const patient of patients) {
    const patientUser = await prisma.user.upsert({
      where: { email: patient.email },
      update: {},
      create: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        cnic: patient.cnic,
        password: defaultPassword,
        gender: patient.gender as any,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: patientUser.id,
          roleId: patientRole!.id,
        },
      },
      update: {},
      create: {
        userId: patientUser.id,
        roleId: patientRole!.id,
      },
    });

    await prisma.patient.upsert({
      where: { userId: patientUser.id },
      update: {},
      create: {
        userId: patientUser.id,
        dateOfBirth: patient.dateOfBirth,
        bloodGroup: patient.bloodGroup,
        phoneNumber: patient.phoneNumber,
        address: patient.address,
        emergencyContact: patient.emergencyContact,
        allergies: patient.allergies,
        medicalHistory: patient.medicalHistory,
        familyHistory: patient.familyHistory,
        onboardingDone: patient.onboardingDone,
        onboardedAt: new Date(),
      },
    });
  }

  // Get receptionist role
  const receptionistRole = await prisma.role.findUnique({
    where: { name: 'RECEPTIONIST' },
  });

  // Create multiple receptionists
  const receptionists = [
    {
      email: 'receptionist@hospital.com',
      firstName: 'Sarah',
      lastName: 'Khan',
      cnic: '42201-9876543-2',
      gender: 'FEMALE',
      phoneNumber: '+92-321-9876543',
      experience: 5,
      qualification: 'Diploma in Healthcare Administration',
    },
    {
      email: 'ali.reception@hospital.com',
      firstName: 'Ali',
      lastName: 'Raza',
      cnic: '42301-8765432-1',
      gender: 'MALE',
      phoneNumber: '+92-333-8765432',
      experience: 3,
      qualification: 'Bachelor in Business Administration',
    },
    {
      email: 'maria.reception@hospital.com',
      firstName: 'Maria',
      lastName: 'Siddiqui',
      cnic: '42401-7654321-0',
      gender: 'FEMALE',
      phoneNumber: '+92-311-7654321',
      experience: 7,
      qualification: 'Diploma in Medical Office Administration',
    },
  ];

  for (const receptionist of receptionists) {
    const receptionistUser = await prisma.user.upsert({
      where: { email: receptionist.email },
      update: {},
      create: {
        firstName: receptionist.firstName,
        lastName: receptionist.lastName,
        email: receptionist.email,
        cnic: receptionist.cnic,
        password: defaultPassword,
        gender: receptionist.gender as any,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: receptionistUser.id,
          roleId: receptionistRole!.id,
        },
      },
      update: {},
      create: {
        userId: receptionistUser.id,
        roleId: receptionistRole!.id,
      },
    });

    await prisma.receptionist.upsert({
      where: { userId: receptionistUser.id },
      update: {},
      create: {
        userId: receptionistUser.id,
        phoneNumber: receptionist.phoneNumber,
        experience: receptionist.experience,
        qualification: receptionist.qualification,
      },
    });
  }

  // Seed Drugs - Extended list with real Pakistani medications
  const drugs = [
    // Pain relievers and fever reducers
    {
      name: 'Panadol 500mg',
      formulaName: 'Paracetamol',
      chemicalFormula: 'C8H9NO2',
      strength: '500mg',
      dosageForm: 'Tablet',
      description: 'Pain reliever and fever reducer',
      supplier: 'GlaxoSmithKline Pakistan',
    },
    {
      name: 'Disprin 300mg',
      formulaName: 'Aspirin',
      chemicalFormula: 'C9H8O4',
      strength: '300mg',
      dosageForm: 'Tablet',
      description: 'Pain reliever, fever reducer, and anti-inflammatory',
      supplier: 'Reckitt Benckiser Pakistan',
    },
    {
      name: 'Brufen 400mg',
      formulaName: 'Ibuprofen',
      chemicalFormula: 'C13H18O2',
      strength: '400mg',
      dosageForm: 'Tablet',
      description: 'Non-steroidal anti-inflammatory drug (NSAID)',
      supplier: 'Abbott Laboratories Pakistan',
    },
    {
      name: 'Ponstan 500mg',
      formulaName: 'Mefenamic Acid',
      chemicalFormula: 'C15H15NO2',
      strength: '500mg',
      dosageForm: 'Capsule',
      description: 'NSAID for pain relief',
      supplier: 'Pfizer Pakistan',
    },
    // Antibiotics
    {
      name: 'Augmentin 625mg',
      formulaName: 'Amoxicillin + Clavulanic Acid',
      chemicalFormula: 'C16H19N3O5S + C8H9NO5',
      strength: '500mg + 125mg',
      dosageForm: 'Tablet',
      description: 'Broad-spectrum antibiotic',
      supplier: 'GlaxoSmithKline Pakistan',
    },
    {
      name: 'Ceclor 500mg',
      formulaName: 'Cefaclor',
      chemicalFormula: 'C15H14ClN3O4S',
      strength: '500mg',
      dosageForm: 'Capsule',
      description: 'Cephalosporin antibiotic',
      supplier: 'Eli Lilly Pakistan',
    },
    {
      name: 'Zithromax 500mg',
      formulaName: 'Azithromycin',
      chemicalFormula: 'C38H72N2O12',
      strength: '500mg',
      dosageForm: 'Tablet',
      description: 'Macrolide antibiotic for respiratory infections',
      supplier: 'Pfizer Pakistan',
    },
    {
      name: 'Flagyl 400mg',
      formulaName: 'Metronidazole',
      chemicalFormula: 'C6H9N3O3',
      strength: '400mg',
      dosageForm: 'Tablet',
      description: 'Antibiotic for anaerobic infections',
      supplier: 'Sanofi Pakistan',
    },
    {
      name: 'Ciproxin 500mg',
      formulaName: 'Ciprofloxacin',
      chemicalFormula: 'C17H18FN3O3',
      strength: '500mg',
      dosageForm: 'Tablet',
      description: 'Fluoroquinolone antibiotic',
      supplier: 'Bayer Pakistan',
    },
    // Diabetes medications
    {
      name: 'Glucophage 500mg',
      formulaName: 'Metformin',
      chemicalFormula: 'C4H11N5',
      strength: '500mg',
      dosageForm: 'Tablet',
      description: 'First-line medication for type 2 diabetes',
      supplier: 'Merck Pakistan',
    },
    {
      name: 'Glucophage XR 1000mg',
      formulaName: 'Metformin Extended Release',
      chemicalFormula: 'C4H11N5',
      strength: '1000mg',
      dosageForm: 'Tablet',
      description: 'Extended release metformin for type 2 diabetes',
      supplier: 'Merck Pakistan',
    },
    {
      name: 'Diamicron 80mg',
      formulaName: 'Gliclazide',
      chemicalFormula: 'C15H21N3O3S',
      strength: '80mg',
      dosageForm: 'Tablet',
      description: 'Sulfonylurea for type 2 diabetes',
      supplier: 'Servier Pakistan',
    },
    {
      name: 'Januvia 100mg',
      formulaName: 'Sitagliptin',
      chemicalFormula: 'C16H15F6N5O',
      strength: '100mg',
      dosageForm: 'Tablet',
      description: 'DPP-4 inhibitor for type 2 diabetes',
      supplier: 'MSD Pakistan',
    },
    // Cardiovascular medications
    {
      name: 'Lipitor 10mg',
      formulaName: 'Atorvastatin',
      chemicalFormula: 'C33H35FN2O5',
      strength: '10mg',
      dosageForm: 'Tablet',
      description: 'Statin to lower cholesterol',
      supplier: 'Pfizer Pakistan',
    },
    {
      name: 'Lipitor 20mg',
      formulaName: 'Atorvastatin',
      chemicalFormula: 'C33H35FN2O5',
      strength: '20mg',
      dosageForm: 'Tablet',
      description: 'Statin to lower cholesterol',
      supplier: 'Pfizer Pakistan',
    },
    {
      name: 'Concor 5mg',
      formulaName: 'Bisoprolol',
      chemicalFormula: 'C18H31NO4',
      strength: '5mg',
      dosageForm: 'Tablet',
      description: 'Beta-blocker for hypertension and heart failure',
      supplier: 'Merck Pakistan',
    },
    {
      name: 'Norvasc 5mg',
      formulaName: 'Amlodipine',
      chemicalFormula: 'C20H25ClN2O5',
      strength: '5mg',
      dosageForm: 'Tablet',
      description: 'Calcium channel blocker for hypertension',
      supplier: 'Pfizer Pakistan',
    },
    {
      name: 'Aprovel 150mg',
      formulaName: 'Irbesartan',
      chemicalFormula: 'C25H28N6O',
      strength: '150mg',
      dosageForm: 'Tablet',
      description: 'Angiotensin receptor blocker for hypertension',
      supplier: 'Sanofi Pakistan',
    },
    {
      name: 'Lasix 40mg',
      formulaName: 'Furosemide',
      chemicalFormula: 'C12H11ClN2O5S',
      strength: '40mg',
      dosageForm: 'Tablet',
      description: 'Loop diuretic for fluid retention',
      supplier: 'Sanofi Pakistan',
    },
    // Gastrointestinal medications
    {
      name: 'Nexium 40mg',
      formulaName: 'Esomeprazole',
      chemicalFormula: 'C17H19N3O3S',
      strength: '40mg',
      dosageForm: 'Capsule',
      description: 'Proton pump inhibitor for GERD',
      supplier: 'AstraZeneca Pakistan',
    },
    {
      name: 'Risek 20mg',
      formulaName: 'Omeprazole',
      chemicalFormula: 'C17H19N3O3S',
      strength: '20mg',
      dosageForm: 'Capsule',
      description: 'Proton pump inhibitor for acid reflux',
      supplier: 'Getz Pharma',
    },
    {
      name: 'Motilium 10mg',
      formulaName: 'Domperidone',
      chemicalFormula: 'C22H24ClN5O2',
      strength: '10mg',
      dosageForm: 'Tablet',
      description: 'Anti-emetic and prokinetic',
      supplier: 'Janssen Pakistan',
    },
    // Respiratory medications
    {
      name: 'Ventolin Inhaler',
      formulaName: 'Salbutamol',
      chemicalFormula: 'C13H21NO3',
      strength: '100mcg/dose',
      dosageForm: 'Inhaler',
      description: 'Short-acting bronchodilator for asthma',
      supplier: 'GlaxoSmithKline Pakistan',
    },
    {
      name: 'Montair 10mg',
      formulaName: 'Montelukast',
      chemicalFormula: 'C35H36ClNO3S',
      strength: '10mg',
      dosageForm: 'Tablet',
      description: 'Leukotriene receptor antagonist for asthma',
      supplier: 'Getz Pharma',
    },
    // Antihistamines and Allergies
    {
      name: 'Zyrtec 10mg',
      formulaName: 'Cetirizine',
      chemicalFormula: 'C21H25ClN2O3',
      strength: '10mg',
      dosageForm: 'Tablet',
      description: 'Antihistamine for allergic conditions',
      supplier: 'GlaxoSmithKline Pakistan',
    },
    {
      name: 'Avil 25mg',
      formulaName: 'Pheniramine',
      chemicalFormula: 'C16H20N2',
      strength: '25mg',
      dosageForm: 'Tablet',
      description: 'Antihistamine for allergies',
      supplier: 'Sanofi Pakistan',
    },
    // Antidepressants and Anxiety
    {
      name: 'Lexapro 10mg',
      formulaName: 'Escitalopram',
      chemicalFormula: 'C20H21FN2O',
      strength: '10mg',
      dosageForm: 'Tablet',
      description: 'SSRI for depression and anxiety',
      supplier: 'Abbott Laboratories Pakistan',
    },
    {
      name: 'Xanax 0.5mg',
      formulaName: 'Alprazolam',
      chemicalFormula: 'C17H13ClN4',
      strength: '0.5mg',
      dosageForm: 'Tablet',
      description: 'Benzodiazepine for anxiety disorders',
      supplier: 'Pfizer Pakistan',
    },
    // Vitamins and Supplements
    {
      name: 'Neurobion Forte',
      formulaName: 'Vitamin B Complex',
      chemicalFormula: 'Various B Vitamins',
      strength: 'B1 100mg + B6 200mg + B12 200mcg',
      dosageForm: 'Tablet',
      description: 'Vitamin B complex for nerve health',
      supplier: 'P&G Health Pakistan',
    },
    {
      name: 'Fefol 150mg',
      formulaName: 'Ferrous Sulfate + Folic Acid',
      chemicalFormula: 'FeSO4 + C19H19N7O6',
      strength: '150mg + 0.5mg',
      dosageForm: 'Capsule',
      description: 'Iron supplement for anemia',
      supplier: 'GlaxoSmithKline Pakistan',
    },
    {
      name: 'Calcet D 600mg',
      formulaName: 'Calcium Carbonate + Vitamin D3',
      chemicalFormula: 'CaCO3 + C27H44O',
      strength: '600mg + 400IU',
      dosageForm: 'Tablet',
      description: 'Calcium and vitamin D supplement',
      supplier: 'Getz Pharma',
    },
    // Thyroid medications
    {
      name: 'Eltroxin 100mcg',
      formulaName: 'Levothyroxine',
      chemicalFormula: 'C15H11I4NO4',
      strength: '100mcg',
      dosageForm: 'Tablet',
      description: 'Thyroid hormone replacement',
      supplier: 'GlaxoSmithKline Pakistan',
    },
  ];

  // For drugs, we'll use createMany since drugs are not unique by name
  // First check if any drugs exist, if not, seed them
  const existingDrugsCount = await prisma.drug.count();
  if (existingDrugsCount === 0) {
    await prisma.drug.createMany({
      data: drugs,
      skipDuplicates: true,
    });
    console.log(`Seeded ${drugs.length} drugs`);
  } else {
    console.log(`Drugs already exist (${existingDrugsCount} found), skipping drug seeding`);
  }

  // Seed Lab Test Templates
  const bloodTestTemplate = await prisma.labTestTemplate.upsert({
    where: { 
      name_version: {
        name: 'Complete Blood Count (CBC)',
        version: '1.0',
      },
    },
    update: {},
    create: {
      name: 'Complete Blood Count (CBC)',
      description: 'Comprehensive blood cell count analysis',
      version: '1.0',
      formStructure: {
        sections: [
          {
            title: 'Red Blood Cells',
            fields: [
              { name: 'rbc_count', label: 'RBC Count', type: 'number', unit: 'million/μL', normalRange: '4.5-5.5' },
              { name: 'hemoglobin', label: 'Hemoglobin', type: 'number', unit: 'g/dL', normalRange: '13.5-17.5' },
              { name: 'hematocrit', label: 'Hematocrit', type: 'number', unit: '%', normalRange: '38.8-50.0' },
            ],
          },
          {
            title: 'White Blood Cells',
            fields: [
              { name: 'wbc_count', label: 'WBC Count', type: 'number', unit: 'thousand/μL', normalRange: '4.5-11.0' },
              { name: 'neutrophils', label: 'Neutrophils', type: 'number', unit: '%', normalRange: '40-70' },
              { name: 'lymphocytes', label: 'Lymphocytes', type: 'number', unit: '%', normalRange: '20-40' },
            ],
          },
          {
            title: 'Platelets',
            fields: [
              { name: 'platelet_count', label: 'Platelet Count', type: 'number', unit: 'thousand/μL', normalRange: '150-400' },
            ],
          },
        ],
      },
    },
  });

  const lipidPanelTemplate = await prisma.labTestTemplate.upsert({
    where: { 
      name_version: {
        name: 'Lipid Panel',
        version: '1.0',
      },
    },
    update: {},
    create: {
      name: 'Lipid Panel',
      description: 'Cholesterol and triglyceride levels',
      version: '1.0',
      formStructure: {
        sections: [
          {
            title: 'Lipid Profile',
            fields: [
              { name: 'total_cholesterol', label: 'Total Cholesterol', type: 'number', unit: 'mg/dL', normalRange: '<200' },
              { name: 'ldl_cholesterol', label: 'LDL Cholesterol', type: 'number', unit: 'mg/dL', normalRange: '<100' },
              { name: 'hdl_cholesterol', label: 'HDL Cholesterol', type: 'number', unit: 'mg/dL', normalRange: '>40' },
              { name: 'triglycerides', label: 'Triglycerides', type: 'number', unit: 'mg/dL', normalRange: '<150' },
            ],
          },
        ],
      },
    },
  });

  const bloodGlucoseTemplate = await prisma.labTestTemplate.upsert({
    where: { 
      name_version: {
        name: 'Blood Glucose Test',
        version: '1.0',
      },
    },
    update: {},
    create: {
      name: 'Blood Glucose Test',
      description: 'Fasting blood sugar level test',
      version: '1.0',
      formStructure: {
        sections: [
          {
            title: 'Glucose Levels',
            fields: [
              { name: 'fasting_glucose', label: 'Fasting Glucose', type: 'number', unit: 'mg/dL', normalRange: '70-100' },
              { name: 'random_glucose', label: 'Random Glucose', type: 'number', unit: 'mg/dL', normalRange: '<140' },
            ],
          },
        ],
      },
    },
  });

  const liverFunctionTemplate = await prisma.labTestTemplate.upsert({
    where: { 
      name_version: {
        name: 'Liver Function Test (LFT)',
        version: '1.0',
      },
    },
    update: {},
    create: {
      name: 'Liver Function Test (LFT)',
      description: 'Comprehensive liver enzyme and function test',
      version: '1.0',
      formStructure: {
        sections: [
          {
            title: 'Liver Enzymes',
            fields: [
              { name: 'alt', label: 'ALT (SGPT)', type: 'number', unit: 'U/L', normalRange: '7-56' },
              { name: 'ast', label: 'AST (SGOT)', type: 'number', unit: 'U/L', normalRange: '10-40' },
              { name: 'alp', label: 'Alkaline Phosphatase', type: 'number', unit: 'U/L', normalRange: '44-147' },
            ],
          },
          {
            title: 'Bilirubin',
            fields: [
              { name: 'total_bilirubin', label: 'Total Bilirubin', type: 'number', unit: 'mg/dL', normalRange: '0.3-1.2' },
              { name: 'direct_bilirubin', label: 'Direct Bilirubin', type: 'number', unit: 'mg/dL', normalRange: '0.0-0.3' },
            ],
          },
        ],
      },
    },
  });

  const kidneyFunctionTemplate = await prisma.labTestTemplate.upsert({
    where: { 
      name_version: {
        name: 'Kidney Function Test (KFT)',
        version: '1.0',
      },
    },
    update: {},
    create: {
      name: 'Kidney Function Test (KFT)',
      description: 'Renal function assessment',
      version: '1.0',
      formStructure: {
        sections: [
          {
            title: 'Kidney Markers',
            fields: [
              { name: 'creatinine', label: 'Creatinine', type: 'number', unit: 'mg/dL', normalRange: '0.7-1.3' },
              { name: 'bun', label: 'Blood Urea Nitrogen', type: 'number', unit: 'mg/dL', normalRange: '7-20' },
              { name: 'uric_acid', label: 'Uric Acid', type: 'number', unit: 'mg/dL', normalRange: '3.5-7.2' },
            ],
          },
        ],
      },
    },
  });

  const urinalysisTemplate = await prisma.labTestTemplate.upsert({
    where: { 
      name_version: {
        name: 'Urinalysis',
        version: '1.0',
      },
    },
    update: {},
    create: {
      name: 'Urinalysis',
      description: 'Complete urine examination',
      version: '1.0',
      formStructure: {
        sections: [
          {
            title: 'Physical Properties',
            fields: [
              { name: 'color', label: 'Color', type: 'text', normalRange: 'Pale to dark yellow' },
              { name: 'appearance', label: 'Appearance', type: 'text', normalRange: 'Clear' },
              { name: 'specific_gravity', label: 'Specific Gravity', type: 'number', normalRange: '1.005-1.030' },
            ],
          },
          {
            title: 'Chemical Analysis',
            fields: [
              { name: 'ph', label: 'pH', type: 'number', normalRange: '4.5-8.0' },
              { name: 'protein', label: 'Protein', type: 'text', normalRange: 'Negative' },
              { name: 'glucose', label: 'Glucose', type: 'text', normalRange: 'Negative' },
            ],
          },
        ],
      },
    },
  });

  const thyroidFunctionTemplate = await prisma.labTestTemplate.upsert({
    where: { 
      name_version: {
        name: 'Thyroid Function Test (TFT)',
        version: '1.0',
      },
    },
    update: {},
    create: {
      name: 'Thyroid Function Test (TFT)',
      description: 'Comprehensive thyroid hormone panel',
      version: '1.0',
      formStructure: {
        sections: [
          {
            title: 'Thyroid Hormones',
            fields: [
              { name: 'tsh', label: 'TSH', type: 'number', unit: 'mIU/L', normalRange: '0.4-4.0' },
              { name: 't3', label: 'T3', type: 'number', unit: 'ng/dL', normalRange: '80-200' },
              { name: 't4', label: 'T4', type: 'number', unit: 'μg/dL', normalRange: '5.0-12.0' },
              { name: 'free_t4', label: 'Free T4', type: 'number', unit: 'ng/dL', normalRange: '0.8-1.8' },
            ],
          },
        ],
      },
    },
  });

  const hba1cTemplate = await prisma.labTestTemplate.upsert({
    where: { 
      name_version: {
        name: 'HbA1c Test',
        version: '1.0',
      },
    },
    update: {},
    create: {
      name: 'HbA1c Test',
      description: 'Glycated hemoglobin test for diabetes monitoring',
      version: '1.0',
      formStructure: {
        sections: [
          {
            title: 'Diabetes Control',
            fields: [
              { name: 'hba1c', label: 'HbA1c', type: 'number', unit: '%', normalRange: '<5.7' },
              { name: 'average_glucose', label: 'Estimated Average Glucose', type: 'number', unit: 'mg/dL', normalRange: '<117' },
            ],
          },
        ],
      },
    },
  });

  const electrolytesTemplate = await prisma.labTestTemplate.upsert({
    where: { 
      name_version: {
        name: 'Electrolyte Panel',
        version: '1.0',
      },
    },
    update: {},
    create: {
      name: 'Electrolyte Panel',
      description: 'Serum electrolyte levels',
      version: '1.0',
      formStructure: {
        sections: [
          {
            title: 'Electrolytes',
            fields: [
              { name: 'sodium', label: 'Sodium', type: 'number', unit: 'mmol/L', normalRange: '136-145' },
              { name: 'potassium', label: 'Potassium', type: 'number', unit: 'mmol/L', normalRange: '3.5-5.0' },
              { name: 'chloride', label: 'Chloride', type: 'number', unit: 'mmol/L', normalRange: '96-106' },
              { name: 'bicarbonate', label: 'Bicarbonate', type: 'number', unit: 'mmol/L', normalRange: '22-29' },
            ],
          },
        ],
      },
    },
  });

  // Create lab tests for different departments
  const radiologyDept = await prisma.standardDepartment.findUnique({
    where: { code: 'RADI' },
  });

  await prisma.department.upsert({
    where: { name: 'Radiology Department' },
    update: {},
    create: {
      name: 'Radiology Department',
      description: 'Medical imaging and diagnostics',
      standardDepartmentId: radiologyDept!.id,
    },
  });

  const generalMedicineDept = await prisma.standardDepartment.findUnique({
    where: { code: 'GENM' },
  });

  const generalMedicineDeptFull = await prisma.department.upsert({
    where: { name: 'General Medicine Department' },
    update: {},
    create: {
      name: 'General Medicine Department',
      description: 'General medical care and diagnostics',
      standardDepartmentId: generalMedicineDept!.id,
    },
  });

  // Create lab tests linked to templates
  await prisma.labTest.upsert({
    where: { 
      id: 1,
    },
    update: {},
    create: {
      name: 'Complete Blood Count (CBC)',
      description: 'Comprehensive analysis of blood cells',
      departmentId: generalMedicineDeptFull.id,
      templateId: bloodTestTemplate.id,
    },
  });

  await prisma.labTest.upsert({
    where: { 
      id: 2,
    },
    update: {},
    create: {
      name: 'Lipid Profile',
      description: 'Cholesterol and lipid analysis',
      departmentId: cardiologyDept.id,
      templateId: lipidPanelTemplate.id,
    },
  });

  await prisma.labTest.upsert({
    where: { 
      id: 3,
    },
    update: {},
    create: {
      name: 'Fasting Blood Sugar',
      description: 'Blood glucose level test',
      departmentId: generalMedicineDeptFull.id,
      templateId: bloodGlucoseTemplate.id,
    },
  });

  await prisma.labTest.upsert({
    where: { 
      id: 4,
    },
    update: {},
    create: {
      name: 'Liver Function Test',
      description: 'Comprehensive liver enzyme analysis',
      departmentId: generalMedicineDeptFull.id,
      templateId: liverFunctionTemplate.id,
    },
  });

  await prisma.labTest.upsert({
    where: { 
      id: 5,
    },
    update: {},
    create: {
      name: 'Kidney Function Test',
      description: 'Renal function markers',
      departmentId: generalMedicineDeptFull.id,
      templateId: kidneyFunctionTemplate.id,
    },
  });

  await prisma.labTest.upsert({
    where: { 
      id: 6,
    },
    update: {},
    create: {
      name: 'Urinalysis',
      description: 'Complete urine examination',
      departmentId: generalMedicineDeptFull.id,
      templateId: urinalysisTemplate.id,
    },
  });

  await prisma.labTest.upsert({
    where: { 
      id: 7,
    },
    update: {},
    create: {
      name: 'Thyroid Function Test',
      description: 'Complete thyroid hormone panel',
      departmentId: generalMedicineDeptFull.id,
      templateId: thyroidFunctionTemplate.id,
    },
  });

  await prisma.labTest.upsert({
    where: { 
      id: 8,
    },
    update: {},
    create: {
      name: 'HbA1c Test',
      description: 'Diabetes monitoring test',
      departmentId: generalMedicineDeptFull.id,
      templateId: hba1cTemplate.id,
    },
  });

  await prisma.labTest.upsert({
    where: { 
      id: 9,
    },
    update: {},
    create: {
      name: 'Electrolyte Panel',
      description: 'Serum electrolyte measurement',
      departmentId: generalMedicineDeptFull.id,
      templateId: electrolytesTemplate.id,
    },
  });

  // Create doctor schedules and appointment slots
  // Focus on primary doctor (doctor@hospital.com) with schedules from -2 days to +4 days
  console.log('Creating doctor schedules and appointment slots...');
  
  // Get all doctors
  const allDoctors = await prisma.doctor.findMany({
    include: {
      user: true,
    },
  });

  // Get primary doctor (cardiologist - doctor@hospital.com)
  const primaryDoctor = allDoctors.find(d => d.user.email === 'doctor@hospital.com');
  const neurologist = allDoctors.find(d => d.user.email === 'dr.ahmed@hospital.com');
  const gynecologist = allDoctors.find(d => d.user.email === 'dr.fatima@hospital.com');
  const pediatrician = allDoctors.find(d => d.user.email === 'dr.sara@hospital.com');
  const orthopedic = allDoctors.find(d => d.user.email === 'dr.usman@hospital.com');

  // Get all patients for appointments
  const allPatients = await prisma.patient.findMany({
    include: { user: true },
  });

  // Get primary patient (patient@hospital.com)
  const primaryPatient = allPatients.find(p => p.user.email === 'patient@hospital.com');
  const patientZainab = allPatients.find(p => p.user.email === 'zainab.hussain@email.com');
  const patientBilal = allPatients.find(p => p.user.email === 'bilal.ahmed@email.com');
  const patientAyesha = allPatients.find(p => p.user.email === 'ayesha.khan@email.com');
  const patientHassan = allPatients.find(p => p.user.email === 'hassan.raza@email.com');
  const patientSana = allPatients.find(p => p.user.email === 'sana.malik@email.com');
  const patientUmar = allPatients.find(p => p.user.email === 'umar.farooq@email.com');

  // Get all receptionists
  const allReceptionists = await prisma.receptionist.findMany({
    include: { user: true },
  });

  // Get primary receptionist
  const primaryReceptionist = allReceptionists.find(r => r.user.email === 'receptionist@hospital.com');

  // Create schedules from -2 days to +4 days (total 7 days including today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper function to create schedule and slots
  async function createDoctorScheduleWithSlots(doctor: any, scheduleDate: Date) {
    // Skip Sunday (day 0)
    if (scheduleDate.getDay() === 0) return null;

    // Morning shift: 9 AM to 1 PM (4 hours = 8 slots of 30 min each)
    const morningStart = new Date(scheduleDate);
    morningStart.setHours(9, 0, 0, 0);
    const morningEnd = new Date(scheduleDate);
    morningEnd.setHours(13, 0, 0, 0);

    const morningSchedule = await prisma.doctorSchedule.create({
      data: {
        doctorId: doctor.id,
        from: morningStart,
        to: morningEnd,
        noOfSlots: 8,
      },
    });

    const morningSlots: Awaited<ReturnType<typeof prisma.appointmentSlot.create>>[] = [];
    for (let i = 0; i < 8; i++) {
      const slotStart = new Date(morningStart);
      slotStart.setMinutes(morningStart.getMinutes() + (i * 30));
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotStart.getMinutes() + 30);

      const slot = await prisma.appointmentSlot.create({
        data: {
          scheduleId: morningSchedule.id,
          startTime: slotStart,
          endTime: slotEnd,
          isBookable: true,
          isBooked: false,
        },
      });
      morningSlots.push(slot);
    }

    // Evening shift: 5 PM to 9 PM (4 hours = 8 slots of 30 min each)
    const eveningStart = new Date(scheduleDate);
    eveningStart.setHours(17, 0, 0, 0);
    const eveningEnd = new Date(scheduleDate);
    eveningEnd.setHours(21, 0, 0, 0);

    const eveningSchedule = await prisma.doctorSchedule.create({
      data: {
        doctorId: doctor.id,
        from: eveningStart,
        to: eveningEnd,
        noOfSlots: 8,
      },
    });

    const eveningSlots: Awaited<ReturnType<typeof prisma.appointmentSlot.create>>[] = [];
    for (let i = 0; i < 8; i++) {
      const slotStart = new Date(eveningStart);
      slotStart.setMinutes(eveningStart.getMinutes() + (i * 30));
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotStart.getMinutes() + 30);

      const slot = await prisma.appointmentSlot.create({
        data: {
          scheduleId: eveningSchedule.id,
          startTime: slotStart,
          endTime: slotEnd,
          isBookable: true,
          isBooked: false,
        },
      });
      eveningSlots.push(slot);
    }

    return { morningSlots, eveningSlots, date: scheduleDate };
  }

  // Store slots by doctor and day for easy access
  type AppointmentSlotType = Awaited<ReturnType<typeof prisma.appointmentSlot.create>>;
  const doctorSlots: { [email: string]: { [dayOffset: number]: { morningSlots: AppointmentSlotType[], eveningSlots: AppointmentSlotType[], date: Date } | null } } = {};

  // Create schedules for all doctors from -2 to +4 days
  for (const doctor of allDoctors) {
    doctorSlots[doctor.user.email] = {};
    
    for (let dayOffset = -2; dayOffset <= 4; dayOffset++) {
      const scheduleDate = new Date(today);
      scheduleDate.setDate(today.getDate() + dayOffset);
      
      const result = await createDoctorScheduleWithSlots(doctor, scheduleDate);
      doctorSlots[doctor.user.email][dayOffset] = result;
    }
  }

  console.log('Doctor schedules and slots created successfully!');

  // Create focused appointments showcasing full workflow
  // Primary patient sees primary doctor (cardiologist) for hypertension management
  // Primary doctor sees multiple patients with cardiac-related issues
  // Primary receptionist handles walk-ins
  console.log('Creating focused sample appointments...');
  
  // Get all drugs for prescriptions
  const allDrugs = await prisma.drug.findMany();
  
  // Get all lab tests for recommendations
  const allLabTests = await prisma.labTest.findMany();

  // Helper function to create appointment with checkup
  async function createAppointmentWithCheckup(
    patient: { id: number },
    slot: { id: number },
    reason: string,
    type: 'online' | 'walkin',
    receptionist: { id: number } | null | undefined,
    checkupData: {
      symptoms: string;
      diagnosis: string;
      notes: string;
      bloodPressure: string;
      temperature: string;
      heartRate: string;
      bloodSugar: string;
      medications: { drugName: string; dosePerIntake: string; timesPerDay: number; totalDays: number; instructions: string }[];
      recommendedTests: string[];
      additionalMedications: string;
    } | null,
    status: 'BOOKED' | 'COMPLETED' = 'BOOKED'
  ) {
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        slotId: slot.id,
        reason: reason,
      },
    });

    if (type === 'online') {
      await prisma.onlineAppointment.create({
        data: {
          appointmentId: appointment.id,
          status: status,
        },
      });
    } else if (receptionist) {
      await prisma.walkinAppointment.create({
        data: {
          appointmentId: appointment.id,
          receptionistId: receptionist.id,
          status: status,
        },
      });
    }

    await prisma.appointmentSlot.update({
      where: { id: slot.id },
      data: { isBooked: true },
    });

    // Create checkup if data provided (for completed appointments)
    if (checkupData && status === 'COMPLETED') {
      const prescription = await prisma.prescription.create({
        data: {
          additionalMedications: checkupData.additionalMedications,
        },
      });

      const testRecommendation = await prisma.checkupTestRecommendation.create({
        data: {
          additionalTests: checkupData.recommendedTests.length > 0 
            ? `Follow up with ${checkupData.recommendedTests.join(', ')} within 1 week` 
            : null,
        },
      });

      await prisma.checkup.create({
        data: {
          appointmentId: appointment.id,
          bloodPressure: checkupData.bloodPressure,
          temperature: checkupData.temperature,
          heartRate: checkupData.heartRate,
          bloodSugar: checkupData.bloodSugar,
          symptoms: checkupData.symptoms,
          diagnosis: checkupData.diagnosis,
          notes: checkupData.notes,
          isDraft: false,
          prescriptionId: prescription.id,
          checkupTestRecommendationId: testRecommendation.id,
        },
      });

      // Add medications
      for (const med of checkupData.medications) {
        const drug = allDrugs.find(d => d.name === med.drugName);
        if (drug) {
          await prisma.medication.create({
            data: {
              drugId: drug.id,
              prescriptionId: prescription.id,
              dosePerIntake: med.dosePerIntake,
              timesPerDay: med.timesPerDay,
              totalDays: med.totalDays,
              instructions: med.instructions,
            },
          });
        }
      }

      // Add recommended lab tests
      for (const testName of checkupData.recommendedTests) {
        const labTest = allLabTests.find(t => t.name === testName);
        if (labTest) {
          await prisma.recommendedLabTest.create({
            data: {
              testRecommendationId: testRecommendation.id,
              labTestId: labTest.id,
            },
          });
        }
      }
    }

    return appointment;
  }

  // =========================================================
  // PRIMARY PATIENT (patient@hospital.com - Ahmed Ali) JOURNEY
  // Progressive hypertension management with primary cardiologist
  // =========================================================

  // DAY -2: Initial consultation with cardiologist (COMPLETED)
  if (primaryDoctor && primaryPatient && doctorSlots['doctor@hospital.com'][-2]) {
    const slots = doctorSlots['doctor@hospital.com'][-2];
    if (slots) {
      await createAppointmentWithCheckup(
        primaryPatient,
        slots.morningSlots[0],
        'Chest pain and high blood pressure concerns',
        'online',
        null,
        {
          symptoms: 'Intermittent chest discomfort on exertion, shortness of breath when climbing stairs, occasional palpitations. BP has been elevated for past 2 months.',
          diagnosis: 'Essential Hypertension Stage 2 with suspected stable angina. Requires further cardiac workup.',
          notes: 'Patient is a 34-year-old male presenting with classic hypertensive symptoms. Family history positive for cardiac disease (father). BP measured at 158/95 mmHg. Heart sounds normal, no murmurs. ECG shows mild LVH. Started on initial antihypertensive therapy. Advised lifestyle modifications and follow-up in 2 days with lab results.',
          bloodPressure: '158/95',
          temperature: '98.6',
          heartRate: '88',
          bloodSugar: '105',
          medications: [
            { drugName: 'Concor 5mg', dosePerIntake: '5mg', timesPerDay: 1, totalDays: 30, instructions: 'Take in the morning with breakfast' },
            { drugName: 'Disprin 300mg', dosePerIntake: '75mg', timesPerDay: 1, totalDays: 30, instructions: 'Take after lunch' },
          ],
          recommendedTests: ['Lipid Profile', 'Complete Blood Count (CBC)', 'Kidney Function Test'],
          additionalMedications: 'Reduce salt intake to less than 5g/day, avoid strenuous exercise until follow-up',
        },
        'COMPLETED'
      );
    }
  }

  // DAY -1: Follow-up with cardiologist - lab results review (COMPLETED)
  if (primaryDoctor && primaryPatient && doctorSlots['doctor@hospital.com'][-1]) {
    const slots = doctorSlots['doctor@hospital.com'][-1];
    if (slots) {
      await createAppointmentWithCheckup(
        primaryPatient,
        slots.morningSlots[1],
        'Follow-up - Lab results and BP monitoring',
        'walkin',
        primaryReceptionist,
        {
          symptoms: 'Feeling better after starting medication. Less chest discomfort. Still occasional morning headaches.',
          diagnosis: 'Essential Hypertension - partially controlled. Dyslipidemia noted on labs. LDL elevated at 165 mg/dL.',
          notes: 'Follow-up visit. BP improved to 145/90 mmHg. Lab results show elevated LDL cholesterol. Creatinine normal. Adding statin therapy. Patient tolerating Concor well. Continue current regimen and add lipid-lowering medication. Next follow-up in 2 weeks.',
          bloodPressure: '145/90',
          temperature: '98.4',
          heartRate: '78',
          bloodSugar: '98',
          medications: [
            { drugName: 'Concor 5mg', dosePerIntake: '5mg', timesPerDay: 1, totalDays: 30, instructions: 'Continue as before - morning with breakfast' },
            { drugName: 'Lipitor 20mg', dosePerIntake: '20mg', timesPerDay: 1, totalDays: 30, instructions: 'Take at bedtime' },
            { drugName: 'Norvasc 5mg', dosePerIntake: '5mg', timesPerDay: 1, totalDays: 30, instructions: 'Take in the evening for better BP control' },
          ],
          recommendedTests: [],
          additionalMedications: 'Continue low-salt diet, start 30 min daily walking',
        },
        'COMPLETED'
      );
    }
  }

  // TODAY: Scheduled appointment - routine follow-up (BOOKED)
  if (primaryDoctor && primaryPatient && doctorSlots['doctor@hospital.com'][0]) {
    const slots = doctorSlots['doctor@hospital.com'][0];
    if (slots) {
      await createAppointmentWithCheckup(
        primaryPatient,
        slots.eveningSlots[2],
        'Routine follow-up - BP and medication review',
        'online',
        null,
        null,
        'BOOKED'
      );
    }
  }

  // DAY +2: Future appointment (BOOKED)
  if (primaryDoctor && primaryPatient && doctorSlots['doctor@hospital.com'][2]) {
    const slots = doctorSlots['doctor@hospital.com'][2];
    if (slots) {
      await createAppointmentWithCheckup(
        primaryPatient,
        slots.morningSlots[3],
        'Follow-up after 2 weeks of combined therapy',
        'online',
        null,
        null,
        'BOOKED'
      );
    }
  }

  // =========================================================
  // PRIMARY DOCTOR (doctor@hospital.com) SEES OTHER PATIENTS
  // Cardiologist handles cardiac-related cases
  // =========================================================

  // Patient Umar - High cholesterol patient with cardiac risk (DAY -2)
  if (primaryDoctor && patientUmar && doctorSlots['doctor@hospital.com'][-2]) {
    const slots = doctorSlots['doctor@hospital.com'][-2];
    if (slots) {
      await createAppointmentWithCheckup(
        patientUmar,
        slots.morningSlots[2],
        'High cholesterol follow-up, family history of heart disease',
        'walkin',
        primaryReceptionist,
        {
          symptoms: 'No acute symptoms. Here for routine cholesterol monitoring. Father and brother both have coronary artery disease.',
          diagnosis: 'Familial Hypercholesterolemia - well controlled on current therapy',
          notes: 'Patient on statin therapy for 2 years. Current LDL at 95 mg/dL (down from 220). Continue current medication. Discussed importance of lifestyle modifications. Good compliance with medication.',
          bloodPressure: '128/82',
          temperature: '98.6',
          heartRate: '72',
          bloodSugar: '96',
          medications: [
            { drugName: 'Lipitor 20mg', dosePerIntake: '20mg', timesPerDay: 1, totalDays: 90, instructions: 'Continue taking at bedtime' },
          ],
          recommendedTests: ['Lipid Profile'],
          additionalMedications: 'Continue heart-healthy diet, maintain regular exercise',
        },
        'COMPLETED'
      );
    }
  }

  // Patient Bilal - Diabetic with cardiac screening (DAY -1)
  if (primaryDoctor && patientBilal && doctorSlots['doctor@hospital.com'][-1]) {
    const slots = doctorSlots['doctor@hospital.com'][-1];
    if (slots) {
      await createAppointmentWithCheckup(
        patientBilal,
        slots.eveningSlots[0],
        'Cardiac screening - diabetic patient with family history of heart attack',
        'online',
        null,
        {
          symptoms: 'Occasional fatigue, no chest pain. Diabetic for 9 years. Father had heart attack at 65. Here for cardiac risk assessment.',
          diagnosis: 'Type 2 Diabetes Mellitus with high cardiovascular risk. No evidence of coronary artery disease at present.',
          notes: 'Comprehensive cardiac evaluation done. ECG normal. BP slightly elevated at 138/86. Started on ACE inhibitor for cardiac protection given diabetic status. Advised strict diabetes control.',
          bloodPressure: '138/86',
          temperature: '98.4',
          heartRate: '76',
          bloodSugar: '165',
          medications: [
            { drugName: 'Aprovel 150mg', dosePerIntake: '150mg', timesPerDay: 1, totalDays: 30, instructions: 'Take in the morning for cardiac protection' },
            { drugName: 'Lipitor 10mg', dosePerIntake: '10mg', timesPerDay: 1, totalDays: 30, instructions: 'Take at bedtime' },
          ],
          recommendedTests: ['Lipid Profile', 'HbA1c Test', 'Kidney Function Test'],
          additionalMedications: 'Continue diabetes medications as prescribed by endocrinologist, strict BP monitoring at home',
        },
        'COMPLETED'
      );
    }
  }

  // Future appointment for another patient with cardiologist (DAY +1)
  if (primaryDoctor && patientSana && doctorSlots['doctor@hospital.com'][1]) {
    const slots = doctorSlots['doctor@hospital.com'][1];
    if (slots) {
      await createAppointmentWithCheckup(
        patientSana,
        slots.morningSlots[0],
        'Palpitations and occasional dizziness - needs cardiac evaluation',
        'online',
        null,
        null,
        'BOOKED'
      );
    }
  }

  // =========================================================
  // PRIMARY RECEPTIONIST (receptionist@hospital.com) WALK-INS
  // Handles various walk-in patients for different doctors
  // =========================================================

  // Walk-in for Neurologist - Patient Sana with migraine (DAY -1)
  if (neurologist && patientSana && doctorSlots['dr.ahmed@hospital.com'][-1] && primaryReceptionist) {
    const slots = doctorSlots['dr.ahmed@hospital.com'][-1];
    if (slots) {
      await createAppointmentWithCheckup(
        patientSana,
        slots.morningSlots[1],
        'Severe migraine episode with visual aura',
        'walkin',
        primaryReceptionist,
        {
          symptoms: 'Severe throbbing headache on left side for 2 days, preceded by visual disturbances (zigzag lines). Nausea, light sensitivity. History of migraines for 5 years.',
          diagnosis: 'Migraine with aura - acute exacerbation',
          notes: 'Classic migraine presentation with visual aura. No focal neurological deficits. Advised to maintain headache diary. Started on prophylactic therapy given frequency of episodes (3-4/month).',
          bloodPressure: '122/78',
          temperature: '98.6',
          heartRate: '76',
          bloodSugar: '90',
          medications: [
            { drugName: 'Brufen 400mg', dosePerIntake: '400mg', timesPerDay: 2, totalDays: 5, instructions: 'Take with food at onset of headache' },
            { drugName: 'Motilium 10mg', dosePerIntake: '10mg', timesPerDay: 3, totalDays: 5, instructions: 'Take for nausea' },
          ],
          recommendedTests: [],
          additionalMedications: 'Rest in dark quiet room during attacks, identify and avoid triggers (stress, certain foods)',
        },
        'COMPLETED'
      );
    }
  }

  // Walk-in for Orthopedic - Patient Hassan post-ACL follow-up (DAY -2)
  if (orthopedic && patientHassan && doctorSlots['dr.usman@hospital.com'][-2] && primaryReceptionist) {
    const slots = doctorSlots['dr.usman@hospital.com'][-2];
    if (slots) {
      await createAppointmentWithCheckup(
        patientHassan,
        slots.eveningSlots[1],
        'Post ACL surgery follow-up - 6 month review',
        'walkin',
        primaryReceptionist,
        {
          symptoms: 'Knee feeling stronger. Occasional mild stiffness in the morning. Completed physiotherapy course. Wants clearance for return to sports.',
          diagnosis: 'Status post ACL reconstruction - excellent recovery',
          notes: '24-year-old athlete, 6 months post ACL reconstruction. Knee stable on examination. Full range of motion achieved. Lachman test negative. Cleared for gradual return to sports with knee brace.',
          bloodPressure: '118/75',
          temperature: '98.6',
          heartRate: '68',
          bloodSugar: '88',
          medications: [
            { drugName: 'Calcet D 600mg', dosePerIntake: '1 tablet', timesPerDay: 1, totalDays: 60, instructions: 'Take with breakfast for bone health' },
          ],
          recommendedTests: [],
          additionalMedications: 'Continue strengthening exercises, use knee brace during sports for next 3 months',
        },
        'COMPLETED'
      );
    }
  }

  // Walk-in for Gynecologist - Patient Zainab (TODAY) - BOOKED
  if (gynecologist && patientZainab && doctorSlots['dr.fatima@hospital.com'][0] && primaryReceptionist) {
    const slots = doctorSlots['dr.fatima@hospital.com'][0];
    if (slots) {
      await createAppointmentWithCheckup(
        patientZainab,
        slots.morningSlots[2],
        'Routine gynecological checkup',
        'walkin',
        primaryReceptionist,
        null,
        'BOOKED'
      );
    }
  }

  // Walk-in for Pediatrician - Patient Ayesha bringing child (DAY +1) - BOOKED
  if (pediatrician && patientAyesha && doctorSlots['dr.sara@hospital.com'][1] && primaryReceptionist) {
    const slots = doctorSlots['dr.sara@hospital.com'][1];
    if (slots) {
      await createAppointmentWithCheckup(
        patientAyesha,
        slots.morningSlots[0],
        'Child vaccination and routine checkup',
        'walkin',
        primaryReceptionist,
        null,
        'BOOKED'
      );
    }
  }

  // =========================================================
  // OTHER DOCTORS' COMPLETED APPOINTMENTS
  // Showcasing department-aligned checkups
  // =========================================================

  // Gynecologist - Patient Zainab (DAY -2) - pregnancy-related
  if (gynecologist && patientZainab && doctorSlots['dr.fatima@hospital.com'][-2]) {
    const slots = doctorSlots['dr.fatima@hospital.com'][-2];
    if (slots) {
      await createAppointmentWithCheckup(
        patientZainab,
        slots.morningSlots[0],
        'Irregular menstrual cycles and hormonal concerns',
        'online',
        null,
        {
          symptoms: 'Irregular periods for past 3 months, heavy bleeding, lower abdominal discomfort. Previous cesarean in 2018.',
          diagnosis: 'Dysfunctional uterine bleeding - likely hormonal imbalance',
          notes: 'Detailed history taken. Pelvic examination normal. Uterus normal size. Will need ultrasound to rule out structural causes. Started on hormonal therapy for cycle regulation.',
          bloodPressure: '115/75',
          temperature: '98.4',
          heartRate: '74',
          bloodSugar: '92',
          medications: [
            { drugName: 'Fefol 150mg', dosePerIntake: '1 capsule', timesPerDay: 1, totalDays: 30, instructions: 'Take after breakfast to replenish iron stores' },
          ],
          recommendedTests: ['Complete Blood Count (CBC)', 'Thyroid Function Test'],
          additionalMedications: 'Schedule pelvic ultrasound, maintain menstrual diary',
        },
        'COMPLETED'
      );
    }
  }

  // Pediatrician - consultation (DAY -1)
  if (pediatrician && patientAyesha && doctorSlots['dr.sara@hospital.com'][-1]) {
    const slots = doctorSlots['dr.sara@hospital.com'][-1];
    if (slots) {
      await createAppointmentWithCheckup(
        patientAyesha,
        slots.eveningSlots[2],
        'Asthma management consultation for self and child',
        'online',
        null,
        {
          symptoms: 'Increased use of rescue inhaler over past week. Wheezing at night. Seasonal change triggering symptoms.',
          diagnosis: 'Bronchial Asthma - mild persistent, seasonal exacerbation',
          notes: 'Patient known asthmatic since childhood. Peak flow reduced to 80% of personal best. Seasonal allergies contributing. Stepped up controller therapy.',
          bloodPressure: '112/72',
          temperature: '98.6',
          heartRate: '82',
          bloodSugar: '88',
          medications: [
            { drugName: 'Montair 10mg', dosePerIntake: '10mg', timesPerDay: 1, totalDays: 30, instructions: 'Take at bedtime regularly' },
            { drugName: 'Zyrtec 10mg', dosePerIntake: '10mg', timesPerDay: 1, totalDays: 14, instructions: 'Take at bedtime for allergy symptoms' },
          ],
          recommendedTests: [],
          additionalMedications: 'Continue Ventolin inhaler as rescue, avoid outdoor activities during high pollen days',
        },
        'COMPLETED'
      );
    }
  }

  // Neurologist - Patient with anxiety (DAY -2)
  if (neurologist && patientBilal && doctorSlots['dr.ahmed@hospital.com'][-2]) {
    const slots = doctorSlots['dr.ahmed@hospital.com'][-2];
    if (slots) {
      await createAppointmentWithCheckup(
        patientBilal,
        slots.morningSlots[3],
        'Tingling sensations in hands, diabetic neuropathy concern',
        'online',
        null,
        {
          symptoms: 'Tingling and numbness in both hands for 2 months, worse at night. Known diabetic. Worried about nerve damage.',
          diagnosis: 'Diabetic peripheral neuropathy - mild sensory involvement',
          notes: 'Clinical examination shows decreased sensation to light touch in glove distribution. Ankle reflexes diminished. Early diabetic neuropathy. Started on B-complex and advised strict glycemic control.',
          bloodPressure: '132/84',
          temperature: '98.6',
          heartRate: '78',
          bloodSugar: '180',
          medications: [
            { drugName: 'Neurobion Forte', dosePerIntake: '1 tablet', timesPerDay: 1, totalDays: 90, instructions: 'Take after breakfast' },
          ],
          recommendedTests: ['HbA1c Test', 'Electrolyte Panel'],
          additionalMedications: 'Strict diabetes control is essential. Protect feet from injury. Follow up in 6 weeks.',
        },
        'COMPLETED'
      );
    }
  }

  // Orthopedic - Joint pain patient (DAY -1)
  if (orthopedic && patientUmar && doctorSlots['dr.usman@hospital.com'][-1]) {
    const slots = doctorSlots['dr.usman@hospital.com'][-1];
    if (slots) {
      await createAppointmentWithCheckup(
        patientUmar,
        slots.morningSlots[2],
        'Lower back pain radiating to leg',
        'walkin',
        allReceptionists.find(r => r.user.email === 'ali.reception@hospital.com') || primaryReceptionist,
        {
          symptoms: 'Lower back pain for 3 weeks, now radiating to right leg. Pain worse on sitting. No weakness or bladder issues.',
          diagnosis: 'Lumbar radiculopathy - likely L4-L5 disc involvement',
          notes: 'Straight leg raise positive at 45 degrees. No motor weakness. Sensory intact. Conservative management first. Will need MRI if no improvement in 2 weeks.',
          bloodPressure: '124/80',
          temperature: '98.6',
          heartRate: '76',
          bloodSugar: '94',
          medications: [
            { drugName: 'Ponstan 500mg', dosePerIntake: '500mg', timesPerDay: 2, totalDays: 7, instructions: 'Take after meals' },
            { drugName: 'Neurobion Forte', dosePerIntake: '1 tablet', timesPerDay: 1, totalDays: 30, instructions: 'Take after breakfast for nerve health' },
          ],
          recommendedTests: [],
          additionalMedications: 'Hot fomentation, avoid lifting heavy weights, sleep on firm mattress',
        },
        'COMPLETED'
      );
    }
  }

  // =========================================================
  // ADDITIONAL FUTURE APPOINTMENTS (BOOKED)
  // To showcase upcoming schedule
  // =========================================================

  // Day +3 appointment
  if (primaryDoctor && patientUmar && doctorSlots['doctor@hospital.com'][3]) {
    const slots = doctorSlots['doctor@hospital.com'][3];
    if (slots) {
      await createAppointmentWithCheckup(
        patientUmar,
        slots.eveningSlots[0],
        'Lipid panel review and medication adjustment',
        'online',
        null,
        null,
        'BOOKED'
      );
    }
  }

  // Day +4 appointment
  if (neurologist && patientSana && doctorSlots['dr.ahmed@hospital.com'][4]) {
    const slots = doctorSlots['dr.ahmed@hospital.com'][4];
    if (slots) {
      await createAppointmentWithCheckup(
        patientSana,
        slots.morningSlots[1],
        'Migraine follow-up - prophylactic therapy review',
        'online',
        null,
        null,
        'BOOKED'
      );
    }
  }

  console.log('Focused appointments and checkups created successfully!');

  console.log('Seed data created successfully!');
  console.log('\n=== Admin credentials ===');
  console.log('Email:', process.env.ADMIN_EMAIL || 'admin@hospital.com');
  console.log('Password:', process.env.ADMIN_PASSWORD || 'admin123456');
  console.log('\n=== Primary Doctor credentials ===');
  console.log('Email: doctor@hospital.com (Cardiologist - Dr. Ali Hassan)');
  console.log('Password:', process.env.DEFAULT_PASSWORD || 'password123');
  console.log('Other doctors: dr.fatima@hospital.com (Gynecologist), dr.ahmed@hospital.com (Neurologist), dr.sara@hospital.com (Pediatrician), dr.usman@hospital.com (Orthopedic)');
  console.log('\n=== Primary Patient credentials ===');
  console.log('Email: patient@hospital.com (Ahmed Ali - Hypertension patient)');
  console.log('Password:', process.env.DEFAULT_PASSWORD || 'password123');
  console.log('Other patients: zainab.hussain@email.com, bilal.ahmed@email.com, ayesha.khan@email.com, hassan.raza@email.com, sana.malik@email.com, umar.farooq@email.com');
  console.log('(All with same password)');
  console.log('\n=== Primary Receptionist credentials ===');
  console.log('Email: receptionist@hospital.com (Sarah Khan)');
  console.log('Password:', process.env.DEFAULT_PASSWORD || 'password123');
  console.log('Other receptionists: ali.reception@hospital.com, maria.reception@hospital.com');
  console.log('(All with same password)');
  console.log('\n=== Seeded Data Summary ===');
  console.log('Roles: 4 (Admin, Doctor, Patient, Receptionist)');
  console.log('Standard Departments: 7');
  console.log('Departments: 7 (Cardiology, Neurology, Orthopedics, Pediatrics, Gynecology, General Medicine, Radiology)');
  console.log('Doctors: 5');
  console.log('Patients: 7');
  console.log('Receptionists: 3');
  console.log('Drugs: 33 medications');
  console.log('Lab Test Templates: 9 templates');
  console.log('Lab Tests: 9 tests');
  console.log('Doctor Schedules: From 2 days ago to 4 days ahead (excluding Sundays)');
  console.log('Appointment Slots: 16 slots per doctor per day (8 morning, 8 evening)');
  console.log('\n=== Demo Workflow Highlights ===');
  console.log('PRIMARY PATIENT JOURNEY (patient@hospital.com):');
  console.log('  - Day -2: Initial hypertension consultation with cardiologist (COMPLETED)');
  console.log('  - Day -1: Follow-up with lab review, added statin therapy (COMPLETED)');
  console.log('  - Today: Routine follow-up appointment (BOOKED)');
  console.log('  - Day +2: Two-week therapy review (BOOKED)');
  console.log('\nPRIMARY DOCTOR (doctor@hospital.com) sees multiple patients:');
  console.log('  - Ahmed Ali (hypertension management)');
  console.log('  - Umar Farooq (familial hypercholesterolemia)');
  console.log('  - Bilal Ahmed (diabetic cardiac screening)');
  console.log('  - Sana Malik (upcoming cardiac evaluation)');
  console.log('\nPRIMARY RECEPTIONIST (receptionist@hospital.com) handled walk-ins:');
  console.log('  - Migraine patient to neurologist');
  console.log('  - Post-surgery patient to orthopedic');
  console.log('  - Gynecology checkup (today)');
  console.log('  - Pediatric vaccination (tomorrow)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
