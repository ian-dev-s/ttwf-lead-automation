import { Header } from '@/components/layout/Header';
import { ContactsManager } from '@/components/contacts/ContactsManager';

export const dynamic = 'force-dynamic';

export default function ContactsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Address Book" />

      <div className="flex-1 p-6 overflow-y-auto">
        <ContactsManager />
      </div>
    </div>
  );
}
