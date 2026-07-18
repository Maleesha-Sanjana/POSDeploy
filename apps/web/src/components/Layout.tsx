import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/pos-password', label: 'POS Password Setting' },
  { to: '/pos', label: 'POS Machines' },
  { to: '/paste', label: 'Paste Instructions' },
  { to: '/schema', label: 'Schema Builder' },
  { to: '/scripts', label: 'Scripts' },
  { to: '/deploy', label: 'Deploy' },
  { to: '/history', label: 'History' },
];

export function Layout() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-brand-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-bold tracking-tight">POSDeploy</h1>
          <p className="text-sm text-blue-200 mt-1">Multi-POS SQL Manager</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-blue-100 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-blue-200">
          Run on SERVER · Port 1433
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
