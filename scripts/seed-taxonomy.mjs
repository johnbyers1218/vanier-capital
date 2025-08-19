#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from '../models/Category.js';
import Industry from '../models/Industry.js';
import Service from '../models/Service.js';

dotenv.config();

const BLOG_CATEGORIES = [
  'Automation Strategy',
  'AI Agents',
  'Integrations',
  'Case Studies',
  'Product Updates',
  'Data Engineering'
];

// Base lists
const BASE_PROJECT_INDUSTRIES = [
  'Healthcare',
  'Financial Services',
  'Professional Services',
  'Home Services',
  'Legal',
  'Technology & SaaS',
  'Logistics & Supply Chain',
  'Manufacturing',
  'Real Estate',
  'Retail & E-commerce'
];
const BASE_PROJECT_SERVICES = [
  'AI Agent Development',
  'Workflow Automation (Make/n8n)',
  'Data Pipelines & Dashboards',
  'Chatbots & Conversational AI',
  'RPA & Browser Automation',
  'CRM/ERP Integrations',
  'API Integration & Development'
];

// Additional comprehensive lists to seed (merged + de-duplicated with base)
const ADDITIONAL_INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Real Estate', 'Education',
  'E-commerce', 'Retail', 'Manufacturing', 'Automotive', 'Aerospace & Defense',
  'Hospitality', 'Media & Entertainment', 'Telecommunications',
  'Energy & Utilities', 'Construction', 'Logistics & Supply Chain',
  'Pharmaceuticals', 'Biotechnology', 'Professional Services', 'Non-profit'
];

const ADDITIONAL_SERVICES = [
  'Web Development', 'Mobile App Development', 'Data Analytics & BI',
  'AI & Machine Learning', 'Cloud & DevOps', 'UI/UX Design', 'Product Design',
  'Digital Marketing', 'SEO & Content Strategy', 'Brand Strategy',
  'IT Consulting', 'Cybersecurity', 'E-commerce Solutions',
  'Custom Software Development', 'Project Management', 'Business Process Automation'
];

// Final lists: union of base + additional
const PROJECT_INDUSTRIES = Array.from(new Set([...BASE_PROJECT_INDUSTRIES, ...ADDITIONAL_INDUSTRIES]));
const PROJECT_SERVICES = Array.from(new Set([...BASE_PROJECT_SERVICES, ...ADDITIONAL_SERVICES]));

const slugify = (s) => s
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)+/g, '')
  .replace(/--+/g, '-');

async function upsertList(Model, list) {
  for (const name of list) {
    const slug = slugify(name);
    await Model.updateOne({ slug }, { $set: { name, slug, isActive: true } }, { upsert: true });
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('[seed-taxonomy] Connected to MongoDB');
  try {
    await upsertList(Category, BLOG_CATEGORIES);
    await upsertList(Industry, PROJECT_INDUSTRIES);
    await upsertList(Service, PROJECT_SERVICES);
    console.log('[seed-taxonomy] Seeded Categories, Industries, and Services');
  } finally {
    await mongoose.connection.close();
  }
}

main().catch((e) => {
  console.error('[seed-taxonomy] Failed:', e.message);
  process.exit(1);
});
