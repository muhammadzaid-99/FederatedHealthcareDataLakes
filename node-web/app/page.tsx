'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { storage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Database, Key, LogIn } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if already authenticated
    const token = storage.getToken();
    if (token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Activity className="h-12 w-12 text-blue-600 mr-3" />
            <h1 className="text-4xl font-bold text-gray-900">Hospital Node Portal</h1>
          </div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Federated Healthcare Data Sharing Platform
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader>
              <Key className="h-8 w-8 text-blue-600 mb-2" />
              <CardTitle>Secure Authentication</CardTitle>
              <CardDescription>
                Connect your hospital node using client credentials issued by the central control plane
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Database className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Data Access Requests</CardTitle>
              <CardDescription>
                Review and respond to incoming data access requests from researchers
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Activity className="h-8 w-8 text-purple-600 mb-2" />
              <CardTitle>Node Management</CardTitle>
              <CardDescription>
                Monitor your node status, capabilities, and configuration in real-time
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Call to Action */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">Get Started</CardTitle>
            <CardDescription>
              Connect your hospital node to the federated data sharing network
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Prerequisites:</h3>
              <ul className="space-y-1 text-sm text-blue-800">
                <li>• Hospital registration approved by central admin</li>
                <li>• Client ID and Client Secret credentials</li>
                <li>• MinIO endpoint for data storage</li>
              </ul>
            </div>

            <Button 
              onClick={() => router.push('/handshake')}
              className="w-full"
              size="lg"
            >
              <LogIn className="mr-2 h-5 w-5" />
              Connect Node (Handshake)
            </Button>
          </CardContent>
        </Card>

        {/* Info Section */}
        <div className="mt-12 text-center text-sm text-gray-500">
          <p>
            Don't have credentials yet?{' '}
            <a 
              href="http://localhost:3000/register" 
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Register your hospital
            </a>
            {' '}at the central admin portal
          </p>
        </div>
      </div>
    </div>
  );
}
