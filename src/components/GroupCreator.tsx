import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

interface Profile {
  user_id: string;
  display_name: string;
  username: string;
}

interface GroupCreatorProps {
  onClose: () => void;
  onCreated?: (chatRoomId: string) => void;
}

const GroupCreator: React.FC<GroupCreatorProps> = ({ onClose, onCreated }) => {
  const { user } = useAuth();
  const [groupName, setGroupName] = useState('');
  const [people, setPeople] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .neq('user_id', user.id);
      setPeople(data || []);
    })();
  }, [user]);

  const toggle = (id: string) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));

  const createGroup = async () => {
    if (!user) return;
    const participantIds = Object.keys(selected).filter(id => selected[id]);
    if (participantIds.length < 2) {
      toast({ title: 'Select at least 2 members', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: room, error: roomErr } = await supabase
        .from('chat_rooms')
        .insert({ created_by: user.id, is_group: true, name: groupName || 'New group' })
        .select()
        .single();
      if (roomErr) throw roomErr;

      const rows = [user.id, ...participantIds].map(uid => ({ chat_room_id: room.id, user_id: uid }));
      const { error: partErr } = await supabase.from('chat_participants').insert(rows);
      if (partErr) throw partErr;

      toast({ title: 'Group created', description: groupName });
      onCreated?.(room.id);
      onClose();
    } catch (e) {
      console.error(e);
      toast({ title: 'Failed to create group', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur">
      <Card className="max-w-lg mx-auto mt-20 p-4">
        <h2 className="text-lg font-semibold mb-3">New Group</h2>
        <Input placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="mb-4" />
        <div className="max-h-72 overflow-y-auto space-y-2">
          {people.map(p => (
            <label key={p.user_id} className="flex items-center gap-3 p-2 rounded hover:bg-accent">
              <Checkbox checked={!!selected[p.user_id]} onCheckedChange={() => toggle(p.user_id)} />
              <div>
                <div className="font-medium">{p.display_name}</div>
                <div className="text-sm text-muted-foreground">@{p.username}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={createGroup} disabled={saving}>Create</Button>
        </div>
      </Card>
    </div>
  );
};

export default GroupCreator;
