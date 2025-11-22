'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Key, Loader2, Server } from 'lucide-react';

export default function HandshakePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    client_id: '',
    client_secret: '',
    minio_endpoint: 'http://minio:9000',
    max_data_size_gb: '100',
    supported_formats: 'parquet,avro',
    location: '',
    contact: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.handshake({
        client_id: formData.client_id,
        client_secret: formData.client_secret,
        minio_endpoint: formData.minio_endpoint,
        capabilities: {
          max_data_size_gb: parseInt(formData.max_data_size_gb),
          supported_formats: formData.supported_formats.split(',').map(f => f.trim()),
        },
        metadata: {
          location: formData.location,
          contact: formData.contact,
        },
      });

      // Store the access token and hospital info
      storage.setAccessToken(response.access_token);
      storage.setHospitalInfo(response.hospital);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Handshake failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <Button
          variant="ghost"
          onClick={() => router.push('/')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center mb-2">
              <Key className="h-6 w-6 text-blue-600 mr-2" />
              <CardTitle className="text-2xl">Node Handshake</CardTitle>
            </div>
            <CardDescription>
              Connect your hospital node using the credentials issued by the central admin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Credentials Section */}
              <div className="space-y-4">
                <div className="flex items-center mb-2">
                  <Server className="h-5 w-5 text-gray-600 mr-2" />
                  <h3 className="text-lg font-semibold">Credentials</h3>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Client ID *</label>
                  <Input
                    required
                    type="text"
                    value={formData.client_id}
                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                    placeholder="Enter your client ID"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Client Secret *</label>
                  <Input
                    required
                    type="password"
                    value={formData.client_secret}
                    onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                    placeholder="Enter your client secret"
                  />
                  <p className="text-xs text-gray-500">
                    This was provided when your hospital registration was approved
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">MinIO Endpoint *</label>
                  <Input
                    required
                    type="text"
                    value={formData.minio_endpoint}
                    onChange={(e) => setFormData({ ...formData, minio_endpoint: e.target.value })}
                    placeholder="http://minio:9000"
                  />
                  <p className="text-xs text-gray-500">
                    Your object storage endpoint for data sharing
                  </p>
                </div>
              </div>

              {/* Capabilities Section */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-lg font-semibold">Capabilities</h3>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Data Size (GB)</label>
                  <Input
                    type="number"
                    value={formData.max_data_size_gb}
                    onChange={(e) => setFormData({ ...formData, max_data_size_gb: e.target.value })}
                    placeholder="100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Supported Formats</label>
                  <Input
                    type="text"
                    value={formData.supported_formats}
                    onChange={(e) => setFormData({ ...formData, supported_formats: e.target.value })}
                    placeholder="parquet,avro"
                  />
                  <p className="text-xs text-gray-500">
                    Comma-separated list of data formats
                  </p>
                </div>
              </div>

              {/* Metadata Section */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-lg font-semibold">Hospital Information</h3>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Location</label>
                  <Input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="City, Country"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Contact Email</label>
                  <Input
                    type="email"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    placeholder="ops@hospital.com"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-5 w-5" />
                    Complete Handshake
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
