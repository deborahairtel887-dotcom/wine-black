import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wine Black Rewards",
  description: "Your rewards and leaderboard position",
};

export default function RewardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="rewards-layout">{children}</div>;
}
