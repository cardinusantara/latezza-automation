import { 
  IconDashboard, 
  IconMessageDots, 
  IconCookie, 
  IconAdjustments,
  IconSettings,
  IconChartLine
} from '@tabler/icons-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const menuItems = [
    { id: 'overview', label: 'Overview', icon: <IconDashboard size={18} /> },
    { id: 'inbox', label: 'Chat Inbox', icon: <IconMessageDots size={18} /> },
    { id: 'products', label: 'Product Catalog', icon: <IconCookie size={18} /> },
    { id: 'ads-report', label: 'Ads Report', icon: <IconChartLine size={18} /> },
    { id: 'actions', label: 'Actions & Controls', icon: <IconAdjustments size={18} /> },
    { id: 'settings', label: 'Settings Panel', icon: <IconSettings size={18} /> }
  ];

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col h-screen fixed left-0 top-0 z-50">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center text-white text-xl">
          <IconMessageDots size={22} />
        </div>
        <div className="text-base font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
          WhatsApp AI
        </div>
      </div>
      
      <ul className="p-6 flex flex-col gap-2 flex-grow list-none">
        {menuItems.map((item) => (
          <li 
            key={item.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${
              activeTab === item.id 
                ? 'text-foreground bg-accent border-l-4 border-emerald-500 rounded-l-none' 
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
            onClick={() => setActiveTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      
      <div className="p-6 border-t border-border text-xs text-muted-foreground text-center">
        <div>Verifikasi Sukses</div>
        <div className="font-semibold mt-1 text-foreground">
          Latezza Cake Hampers
        </div>
      </div>
    </div>
  );
}
