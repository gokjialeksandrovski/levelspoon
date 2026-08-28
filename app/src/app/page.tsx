import { redirect } from "next/navigation";

const HomePage = () => {
  redirect("/meals/new");
};

export default HomePage;
