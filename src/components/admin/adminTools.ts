import type { Href } from 'expo-router';
import type { IconName } from '@/components/ui/Icon';

// Every admin tool, in one grid at the top of the panel. The client runs the
// app from here, so nothing an admin can do should need hunting for.
export const ADMIN_TOOLS: {
  icon: IconName;
  label: string;
  hint: string;
  tint: string;
  href: Href;
}[] = [
  {
    icon: 'user',
    label: 'Users',
    hint: 'Premium, admins, uploads, bans',
    tint: 'rgba(46,125,255,0.22)',
    href: '/admin/users',
  },
  {
    icon: 'check-circle',
    label: 'User approvals',
    hint: 'Approve new accounts',
    tint: 'rgba(46,212,122,0.2)',
    href: '/admin/user-approvals',
  },
  {
    icon: 'diamond',
    label: 'Subscribers',
    hint: 'Active, ending, expired',
    tint: 'rgba(227,179,65,0.2)',
    href: '/admin/subscribers',
  },
  {
    icon: 'chart',
    label: 'Payments',
    hint: 'UPI, Razorpay, Sabpaisa',
    tint: 'rgba(0,212,255,0.18)',
    href: '/admin/payments',
  },
  {
    icon: 'package',
    label: 'Plans & prices',
    hint: 'Names, prices, on sale',
    tint: 'rgba(180,169,255,0.2)',
    href: '/admin/plans',
  },
  {
    icon: 'broadcast',
    label: 'Channels',
    hint: 'Edit, hide, suspend, delete',
    tint: 'rgba(46,125,255,0.22)',
    href: '/admin/channels',
  },
  {
    icon: 'clipboard',
    label: 'Pending channels',
    hint: 'New channels to review',
    tint: 'rgba(255,179,71,0.2)',
    href: '/admin/pending-channels',
  },
  {
    icon: 'edit',
    label: 'Pending content',
    hint: 'Uploads to review',
    tint: 'rgba(255,179,71,0.2)',
    href: '/admin/pending-channel-content',
  },
  {
    icon: 'film',
    label: 'Content & access',
    hint: 'Publish, free/premium, edit',
    tint: 'rgba(180,169,255,0.2)',
    href: '/admin/content',
  },
  {
    icon: 'upload',
    label: 'Upload',
    hint: 'Add videos to any channel',
    tint: 'rgba(46,125,255,0.22)',
    href: '/admin/upload',
  },
  {
    icon: 'bell',
    label: 'Announcement',
    hint: 'Message all users',
    tint: 'rgba(0,212,255,0.18)',
    href: '/admin/broadcast',
  },
  {
    icon: 'flag',
    label: 'Reports',
    hint: 'Reported content and users',
    tint: 'rgba(255,77,109,0.2)',
    href: '/admin/reports',
  },
  {
    icon: 'chart',
    label: 'Channel activity',
    hint: 'What is growing',
    tint: 'rgba(46,212,122,0.2)',
    href: '/admin/channel-activity',
  },
  {
    icon: 'history',
    label: 'Audit log',
    hint: 'Every admin action',
    tint: 'rgba(159,176,201,0.18)',
    href: '/admin/audit',
  },
];
