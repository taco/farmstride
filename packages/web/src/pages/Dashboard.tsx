import { useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import ActivityCard from '@/components/ActivityCard';
import { HorseCard } from '@/components/HorseCard';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import type {
    GetDashboardDataQuery,
    GetDashboardDataQueryVariables,
} from '@/generated/graphql';

const DASHBOARD_QUERY = gql`
    query GetDashboardData {
        horses {
            id
            name
            activity(weeks: 12) {
                weekStart
                count
            }
        }
        sessions(limit: 20) {
            id
            date
            durationMinutes
            workType
            intensity
            notes
            horse {
                name
            }
            rider {
                name
            }
        }
    }
`;

export default function Dashboard(): React.ReactNode {
    const { push } = useAppNavigate();
    const { data, loading, error } = useQuery<
        GetDashboardDataQuery,
        GetDashboardDataQueryVariables
    >(DASHBOARD_QUERY, {
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'cache-first',
    });

    if (loading && !data)
        return <div className="p-4 text-center">Loading activity...</div>;
    if (error)
        return (
            <div className="p-4 text-center text-red-500">
                Error loading data.
            </div>
        );

    return (
        <div>
            <div className="p-4 space-y-6">
                {/* Farm Activity Section */}
                <section>
                    <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">
                        Farm Activity
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        {data?.horses.map((horse) => (
                            <HorseCard key={horse.id} horse={horse} />
                        ))}
                    </div>
                </section>

                {/* Recent Activity Section */}
                <section>
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h2 className="text-sm font-medium text-muted-foreground">
                            Recent Activity
                        </h2>
                        <button
                            className="text-sm text-primary"
                            onClick={() => push('/sessions')}
                        >
                            See all
                        </button>
                    </div>
                    <div className="space-y-3">
                        {data?.sessions.map((session) => (
                            <ActivityCard
                                key={session.id}
                                session={session}
                                onClick={() => push(`/sessions/${session.id}`)}
                            />
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
