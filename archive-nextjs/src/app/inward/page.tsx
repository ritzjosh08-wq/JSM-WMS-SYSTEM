import InwardClient from "./InwardClient";

export const metadata = {
  title: "Inward Entry — JSM Logistics WMS",
  description: "Record goods received at the warehouse gate — manually or via Excel upload",
};

export default function InwardPage() {
  return <InwardClient />;
}
