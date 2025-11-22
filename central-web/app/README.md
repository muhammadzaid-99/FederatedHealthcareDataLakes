# HMS Central Control Plane - Admin Dashboard

Modern Next.js 14 admin dashboard for the Hospital Management System (HMS) Central Control Plane with shadcn/ui components.

## Features

### 🎯 Admin Dashboard
- **Overview**: Real-time statistics and recent activity
- **Pending Registrations**: Approve or reject hospital registration requests
- **Hospital Management**: View all registered hospitals and their details
- **Data Requests**: Manage and track data access requests

### 🌐 Public Portal
- **Data Access Request**: Simple form for researchers to request federated data
- **Status Tracking**: Check request status using request ID

### 🎨 UI/UX
- Modern, professional design with Tailwind CSS
- Responsive layout for all screen sizes
- shadcn/ui components for consistency
- Loading skeletons for better UX
- Real-time error handling
- Clean, accessible interface

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **Icons**: Lucide React
- **API Client**: Fetch API with custom wrapper

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Backend API running on `http://localhost:8080`

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

The application will be available at `http://localhost:3000`

## Project Structure

```
app/
├── app/                    # Next.js App Router
│   ├── globals.css        # Global styles with Tailwind
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page (redirects)
│   ├── login/             # Admin login page
│   ├── dashboard/         # Admin dashboard
│   │   ├── layout.tsx     # Dashboard layout with navigation
│   │   ├── page.tsx       # Overview page
│   │   ├── pending/       # Pending registrations
│   │   ├── hospitals/     # All hospitals
│   │   └── requests/      # Data requests
│   └── request/           # Public request page
├── components/
│   └── ui/                # shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── textarea.tsx
│       ├── table.tsx
│       ├── badge.tsx
│       └── skeleton.tsx
├── lib/
│   ├── api.ts             # API client
│   └── utils.ts           # Utility functions
└── package.json
```

## Pages

### Public Pages

- `/` - Redirects to public request page
- `/request` - Public data access request form and status checker

### Admin Pages (Protected)

- `/login` - Admin login (default: admin/admin123)
- `/dashboard` - Overview with statistics
- `/dashboard/pending` - Pending hospital registrations
- `/dashboard/hospitals` - All registered hospitals
- `/dashboard/requests` - All data access requests

## API Integration

The application connects to the backend API through the `/api` proxy configured in `next.config.js`. All requests are automatically proxied to `http://localhost:8080`.

### API Endpoints Used

- `POST /api/v1/auth/admin/login` - Admin authentication
- `GET /api/v1/hospitals` - List all hospitals
- `GET /api/v1/hospitals/pending` - List pending registrations
- `POST /api/v1/hospitals/:id/approve` - Approve hospital
- `POST /api/v1/hospitals/:id/reject` - Reject hospital
- `GET /api/v1/requests` - List all data requests
- `POST /api/v1/requests` - Create data request
- `GET /api/v1/requests/:id` - Get request status

## Features in Detail

### Authentication
- JWT-based authentication
- Token stored in localStorage
- Auto-redirect on unauthorized access
- Secure logout

### Hospital Management
- View all hospitals with status
- Approve/reject pending registrations
- View credentials (Client ID, Nessie namespace)
- Real-time updates

### Data Request Flow
1. User submits request with required fields
2. Request forwarded to all approved hospitals
3. Hospitals process and respond
4. Admin can track all requests
5. Status updates in real-time

### Loading States
- Skeleton loaders for all data fetching
- Disabled buttons during processing
- Clear error messages
- Success confirmations

## Customization

### Colors
Primary color is purple/indigo. To change, modify `tailwind.config.ts`:

```typescript
colors: {
  primary: {
    DEFAULT: "hsl(262 83% 58%)", // Change this
    foreground: "hsl(210 40% 98%)",
  },
}
```

### Components
All UI components are in `components/ui/` and can be customized individually.

## Development Tips

### Hot Reload
The development server supports hot reload. Changes are reflected instantly.

### TypeScript
All components are strictly typed. The API client has proper TypeScript interfaces.

### Debugging
- Check browser console for errors
- API calls are logged in Network tab
- Error messages displayed in UI

## Production Deployment

### Build
```bash
npm run build
```

### Environment Variables
Create `.env.local` for production:

```env
NEXT_PUBLIC_API_URL=https://your-api-domain.com
```

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Compatibility with Legacy Admin

The legacy admin interface at `/web/admin/index.html` continues to work independently. Both interfaces can coexist:

- Legacy: Direct HTML/JS interface at `/admin`
- Modern: Next.js interface at root (`/`)

## Support

For issues or questions:
1. Check browser console for errors
2. Verify backend API is running
3. Check network requests in DevTools
4. Review API response status codes

## License

Part of the HMS Central Control Plane project.
