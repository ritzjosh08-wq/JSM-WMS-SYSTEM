import { prisma } from "@/lib/prisma";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export default async function DamagePage() {
  const damages = await prisma.damageRecord.findMany({
    orderBy: { date: 'desc' }
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-blue">Damage Management</h1>
      
      <Card title="Reported Damages">
        <Table 
          data={damages} 
          keyExtractor={(item) => item.id} 
          columns={[
            { key: 'materialCode', header: 'Material' },
            { key: 'batchNumber', header: 'Batch No' },
            { key: 'damagedQty', header: 'Damaged Qty' },
            { 
              key: 'status', 
              header: 'Status',
              render: (item) => <Badge variant={item.status === 'DAMAGED' ? 'danger' : 'warning'}>{item.status}</Badge>
            },
            { key: 'damageType', header: 'Damage Type' },
            { key: 'date', header: 'Date', render: (item) => new Date(item.date).toLocaleDateString() },
          ]} 
        />
      </Card>
    </div>
  );
}
