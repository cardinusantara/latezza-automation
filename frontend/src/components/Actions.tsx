import { IconAlarm } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ActionsProps {
  onTriggerFollowUps: () => void;
}

export default function Actions({ onTriggerFollowUps }: ActionsProps) {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">System Action Controls</CardTitle>
        <CardDescription className="text-sm text-muted-foreground leading-relaxed">
          Gunakan tombol di bawah ini untuk menjalankan pencarian dan pengiriman pesan follow-up kustomer secara langsung tanpa menunggu jadwal cron otomatis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 flex-wrap">
          <Button 
            onClick={onTriggerFollowUps}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold gap-2"
          >
            <IconAlarm size={16} /> 
            <span>Run Follow-up Checks</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
