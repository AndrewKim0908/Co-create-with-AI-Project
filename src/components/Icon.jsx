import {
  LayoutDashboard, LayoutGrid, Zap, AlertTriangle, GitBranch, Users, BarChart2,
  Settings, HelpCircle, ChevronsUpDown, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Cpu, PenTool, UserCheck, UserPlus, ArrowRight, Check, X, Plus, Sparkles,
  MessageSquare, Send, Loader, CheckCircle, XCircle, FileText,
  Download, ZoomIn, ZoomOut, Maximize2, Layers, Eye, EyeOff, Mail, Lock,
  Thermometer, Palette, Shield, ClipboardCheck, Package, Hammer, Search, Briefcase,
} from 'lucide-react';

const MAP = {
  'layout-dashboard': LayoutDashboard,
  'layout-grid': LayoutGrid,
  zap: Zap,
  'alert-triangle': AlertTriangle,
  'git-branch': GitBranch,
  users: Users,
  'bar-chart-2': BarChart2,
  settings: Settings,
  'help-circle': HelpCircle,
  'chevron-up-down': ChevronsUpDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  cpu: Cpu,
  'pen-tool': PenTool,
  'user-check': UserCheck,
  'user-plus': UserPlus,
  thermometer: Thermometer,
  palette: Palette,
  shield: Shield,
  'clipboard-check': ClipboardCheck,
  package: Package,
  hammer: Hammer,
  search: Search,
  briefcase: Briefcase,
  'arrow-right': ArrowRight,
  check: Check,
  x: X,
  plus: Plus,
  sparkles: Sparkles,
  'message-square': MessageSquare,
  send: Send,
  loader: Loader,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
  'file-text': FileText,
  download: Download,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
  'maximize-2': Maximize2,
  layers: Layers,
  eye: Eye,
  'eye-off': EyeOff,
  mail: Mail,
  lock: Lock,
};

export default function Icon({ name, size = 16, color, style = {}, className = '' }) {
  const Cmp = MAP[name];
  if (!Cmp) return null;
  return (
    <Cmp
      size={size}
      color={color}
      strokeWidth={2}
      style={{ flexShrink: 0, ...style }}
      className={className}
      aria-hidden="true"
    />
  );
}
