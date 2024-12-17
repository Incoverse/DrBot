interface Offense {
    id: string,
    violation: string,
    rule_index: number,
    punishment_type: "WARNING" | "TIMEOUT" | "KICK" | "TEMPORARY_BANISHMENT" | "PERMANENT_BANISHMENT",
    status: "ACTIVE" | "REVOKED" | "DENIED" | "APPEALED",
    appeal: {
        status: "OPEN" | "APPROVED" | "DENIED" | "AYR"
        transcript: {
            type: "message" | "status",
            message?: string,
            status?: "OPEN" | "APPROVED" | "DENIED",
            timestamp: string,
            user_id: string
            anonymous?: boolean
        }[],
        miscellaneous: {
            discordChannelID?: string,
            webhookIDs?: {
                [key: string]: string
            }
        }
    } | null,
    can_appeal: boolean,
    violated_at: string
    ends_at: string | null,
    served: boolean | null,
    original_duration: string | null,
    expires_at: string | null,
    offense_count: number,
    action_taken_by: string,
    user_id: string
}