import { IconAlarm, IconSparkles } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ActionsProps {
  onTriggerFollowUps: () => void;
  onTriggerCreativeAnalysis: () => void;
}

export default function Actions({ onTriggerFollowUps, onTriggerCreativeAnalysis }: ActionsProps) {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">System Action Controls</CardTitle>
        <CardDescription className="text-sm text-muted-foreground leading-relaxed">
          Gunakan tombol di bawah ini untuk menjalankan pencarian dan pengiriman pesan follow-up kustomer atau regenerasi ide konten iklan kreatif secara langsung.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 flex-wrap">
          <Button 
            onClick={onTriggerFollowUps}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2"
          >
            <IconAlarm size={16} /> 
            <span>Run Follow-up Checks</span>
          </Button>

          <Button 
            onClick={onTriggerCreativeAnalysis}
            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold gap-2 transition-all duration-200"
          >
            <IconSparkles size={16} /> 
            <span>Run AI Creative Analysis</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
