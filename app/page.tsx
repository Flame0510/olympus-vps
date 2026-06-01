import DashboardLayout from './components/DashboardLayout';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return <DashboardLayout initialCosts={{ today: 0, allTime: 0, byModel: [] }} />;
}
