/**
 * Client profile viewed from a session — same body as the Clients-tab
 * client detail, but living in the sessions stack so the back button
 * pops back to the session that originated the navigation rather than
 * jumping to the Clients tab.
 */
import { TrainerClientProfile } from "@/app/(trainer)/clients/[id]";

export default TrainerClientProfile;
