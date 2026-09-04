import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';

import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, Save, Plus } from 'lucide-react';
import ActivityCard from '@/components/ActivityCard';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import {
    GetHorseForEditQuery,
    GetHorseForEditQueryVariables,
    CreateHorseMutation,
    CreateHorseMutationVariables,
    UpdateHorseMutation,
    UpdateHorseMutationVariables,
} from '@/generated/graphql';

const GET_HORSE_FOR_EDIT = gql`
    query GetHorseForEdit($id: ID!) {
        horse(id: $id) {
            id
            name
            notes
            isActive
            sessions {
                id
                date
                durationMinutes
                workType
                notes
                horse {
                    name
                }
                rider {
                    name
                }
            }
        }
    }
`;

const CREATE_HORSE_MUTATION = gql`
    mutation CreateHorse($name: String!, $notes: String) {
        createHorse(name: $name, notes: $notes) {
            id
        }
    }
`;

const UPDATE_HORSE_MUTATION = gql`
    mutation UpdateHorse(
        $id: ID!
        $name: String
        $notes: String
        $isActive: Boolean
    ) {
        updateHorse(id: $id, name: $name, notes: $notes, isActive: $isActive) {
            id
        }
    }
`;

export default function EditHorse() {
    const [{ name, notes, isActive, errorMessage }, setFormState] = useState<{
        name: string;
        notes: string;
        isActive: boolean;
        errorMessage: string | null;
    }>({
        name: '',
        notes: '',
        isActive: true,
        errorMessage: null,
    });

    const { id } = useParams<{ id: string }>();
    const isEditMode = id !== undefined;
    const { back, backTo } = useAppNavigate();

    const { data, loading: horseLoading } = useQuery<
        GetHorseForEditQuery,
        GetHorseForEditQueryVariables
    >(GET_HORSE_FOR_EDIT, {
        variables: { id: id! },
        skip: !isEditMode,
    });

    useEffect(() => {
        if (isEditMode && data?.horse) {
            const { horse } = data;
            setFormState((prev) => ({
                ...prev,
                name: horse.name,
                isActive: horse.isActive,
                notes: horse.notes ?? '',
            }));
        }
    }, [data, isEditMode]);

    const [createHorse, { loading: createLoading }] = useMutation<
        CreateHorseMutation,
        CreateHorseMutationVariables
    >(CREATE_HORSE_MUTATION);

    const [updateHorse, { loading: updateLoading }] = useMutation<
        UpdateHorseMutation,
        UpdateHorseMutationVariables
    >(UPDATE_HORSE_MUTATION);

    const loading = createLoading || updateLoading;

    const recentSessions = data?.horse?.sessions
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setFormState((prev) => ({
            ...prev,
            errorMessage: null,
        }));

        const trimmedName = name.trim();
        if (!trimmedName) {
            setFormState((prev) => ({
                ...prev,
                errorMessage: 'Name is required.',
            }));
            return;
        }

        try {
            if (isEditMode) {
                await updateHorse({
                    variables: {
                        id: id!,
                        name: trimmedName,
                        notes: notes.trim(),
                        isActive,
                    },
                    update(cache) {
                        cache.evict({ fieldName: 'horses' });
                        cache.evict({ fieldName: 'horse' });
                        cache.gc();
                    },
                });
            } else {
                await createHorse({
                    variables: {
                        name: trimmedName,
                        notes: notes.trim() || null,
                    },
                    update(cache) {
                        cache.evict({ fieldName: 'horses' });
                        cache.gc();
                    },
                });
            }
            backTo('/');
        } catch (err) {
            setFormState((prev) => ({
                ...prev,
                errorMessage:
                    err instanceof Error ? err.message : 'An error occurred',
            }));
        }
    };

    if (isEditMode && horseLoading) {
        return (
            <div className="min-h-dvh flex items-start justify-center p-4 bg-background">
                <Card className="w-full max-w-md">
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">
                            Loading…
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isEditMode && !data?.horse) {
        return (
            <div className="min-h-dvh flex items-start justify-center p-4 bg-background">
                <Card className="w-full max-w-md">
                    <CardContent className="pt-6">
                        <p className="text-center text-red-500">
                            Horse not found.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-dvh flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center gap-2 p-4 border-b">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={back}
                    className="h-10 w-10"
                    aria-label="Go back"
                >
                    <ChevronLeft className="h-6 w-6" />
                </Button>
                <h1 className="text-lg font-semibold">
                    {isEditMode ? 'Edit Horse' : 'Add Horse'}
                </h1>
            </div>

            <div className="flex-1 flex items-start justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>
                            {isEditMode ? 'Edit horse' : 'Add horse'}
                        </CardTitle>
                        <CardDescription>
                            {isEditMode
                                ? "Update your horse's details."
                                : 'Add a new horse to your farm.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) =>
                                        setFormState((prev) => ({
                                            ...prev,
                                            name: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Midnight"
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="notes">Notes</Label>
                                <textarea
                                    id="notes"
                                    value={notes}
                                    onChange={(e) =>
                                        setFormState((prev) => ({
                                            ...prev,
                                            notes: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. 'Chestnut gelding, 14 hands'"
                                    rows={4}
                                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                                />
                            </div>

                            {isEditMode && (
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={isActive}
                                        onChange={(e) =>
                                            setFormState((prev) => ({
                                                ...prev,
                                                isActive: e.target.checked,
                                            }))
                                        }
                                        className="h-4 w-4 rounded border-input bg-background accent-primary"
                                    />
                                    <Label
                                        htmlFor="isActive"
                                        className="cursor-pointer"
                                    >
                                        Active
                                    </Label>
                                </div>
                            )}

                            {errorMessage && (
                                <p className="text-sm text-red-500">
                                    {errorMessage}
                                </p>
                            )}

                            <Button
                                className="w-full shadow-lg rounded-full text-base font-medium"
                                size="lg"
                                type="submit"
                                disabled={loading}
                            >
                                {isEditMode ? (
                                    <>
                                        <Save className="mr-2 h-5 w-5" />
                                        {loading ? 'Saving…' : 'Save'}
                                    </>
                                ) : (
                                    <>
                                        <Plus className="mr-2 h-5 w-5" />
                                        {loading ? 'Creating…' : 'Create'}
                                    </>
                                )}
                            </Button>

                            {isEditMode && recentSessions && (
                                <div className="space-y-2">
                                    <Label>Recent sessions</Label>
                                    <div className="space-y-2">
                                        {recentSessions.length > 0 ? (
                                            recentSessions.map((session) => (
                                                <ActivityCard
                                                    key={session.id}
                                                    session={session}
                                                />
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No sessions yet.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
