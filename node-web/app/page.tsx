'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { storage } from '@/lib/api';
import { Activity } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = storage.getToken();
    if (token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 mb-4 animate-pulse">
          <Activity className="h-7 w-7 text-white" />
        </div>
        <p className="text-sm text-slate-400">Redirecting…</p>
      </div>
    </div>
  );
}
