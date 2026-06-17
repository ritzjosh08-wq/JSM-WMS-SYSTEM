import { prisma } from "@/lib/prisma";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export default async function TrucksPage() {
  const trucks = await prisma.truckMovement.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-blue">Truck Tracking</h1>
      
      <Card title="Inbound & Outbound Truck Movements">
        <Table 
          data={trucks} 
          keyExtractor={(item) => item.id} 
          columns={[
            { key: 'truckNumber', header: 'Truck No' },
            { 
              key: 'movementType', 
              header: 'Type',
              render: (item) => <Badge variant={item.movementType === 'INBOUND' ? 'primary' : 'warning'}>{item.movementType}</Badge>
            },
            { key: 'transporter', header: 'Transporter' },
            { 
              key: 'status', 
              header: 'Status',
              render: (item) => <Badge variant={item.status.includes('COMPLETED') || item.status === 'DISPATCHED' ? 'success' : 'neutral'}>{item.status}</Badge>
            },
            { 
              key: 'createdAt', 
              header: 'Date Logged',
              render: (item) => new Date(item.createdAt).toLocaleString()
            }
          ]} 
        />
      </Card>
    </div>
  );
}
