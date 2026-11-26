import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, Save, Clock, Scissors, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SalonGalleryManager } from "./SalonGalleryManager";
import { useLanguage } from "@/hooks/useLanguage";
import { BookingSlotMode } from "@/lib/booking-slots";
import { ORDERED_WEEK_DAYS, TIME_OPTIONS_24H, normalizeHHMM } from "@/lib/time-format";

interface Specialist {
  id: string;
  name: string;
  title: string;
  is_active: boolean;
  user_id: string | null;
  booking_slot_mode: BookingSlotMode;
}

interface SpecialistsManagerProps {
  restrictToSpecialistId?: string | null;
}

interface SpecialistWorkHour {
  id: string;
  specialist_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: boolean;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
}

export function SpecialistsManager({ restrictToSpecialistId }: SpecialistsManagerProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const isRo = language === "ro";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSpecialist, setEditingSpecialist] = useState<Specialist | null>(null);
  const [formName, setFormName] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formUserId, setFormUserId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<string | null>(restrictToSpecialistId || null);
  const [editedWorkHours, setEditedWorkHours] = useState<Record<number, Partial<SpecialistWorkHour>>>({});

  // Service CRUD state
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState({ name: "", description: "", duration_minutes: "30", price: "0" });
  const [deleteServiceId, setDeleteServiceId] = useState<string | null>(null);

  // Fetch specialists
  const { data: specialists = [], isLoading } = useQuery({
    queryKey: ["admin-specialists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialists")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Specialist[];
    },
  });

  // Fetch all profiles for user assignment (admin only)
  const { data: allProfiles = [] } = useQuery({
    queryKey: ["admin-all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: !restrictToSpecialistId,
  });

  // Auto-select restricted specialist
  useEffect(() => {
    if (restrictToSpecialistId && specialists.length > 0) {
      setSelectedSpecialistId(restrictToSpecialistId);
    }
  }, [restrictToSpecialistId, specialists]);

  // Fetch services for the selected specialist
  const { data: specialistServicesList = [] } = useQuery({
    queryKey: ["specialist-services-direct", selectedSpecialistId],
    queryFn: async () => {
      if (!selectedSpecialistId) return [];
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("specialist_id", selectedSpecialistId)
        .order("name");
      if (error) throw error;
      return data as Service[];
    },
    enabled: !!selectedSpecialistId,
  });

  // Fetch specialist work hours
  const { data: specialistWorkHours = [] } = useQuery({
    queryKey: ["specialist-work-hours", selectedSpecialistId],
    queryFn: async () => {
      if (!selectedSpecialistId) return [];
      const { data, error } = await supabase
        .from("specialist_work_hours")
        .select("*")
        .eq("specialist_id", selectedSpecialistId)
        .order("day_of_week");
      if (error) throw error;
      return data as SpecialistWorkHour[];
    },
    enabled: !!selectedSpecialistId,
  });

  useEffect(() => {
    setEditedWorkHours({});
  }, [selectedSpecialistId]);

  // Specialist mutations
  const saveSlotModeMutation = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: BookingSlotMode }) => {
      const { error } = await supabase.rpc("set_specialist_booking_slot_mode", { p_specialist_id: id, p_mode: mode });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all(["admin-specialists", "admin-specialists-all", "booking-specialists-all"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      toast({ title: isRo ? "Modul de programare a fost salvat" : "Booking mode saved" });
    },
    onError: () => toast({ title: isRo ? "Opțiunea nu a putut fi salvată" : "Could not save booking mode", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: specialist, error } = await supabase
        .from("specialists")
        .insert({ name: formName, title: formTitle, is_active: formActive, user_id: formUserId || null })
        .select()
        .single();
      if (error) throw error;
      const workHoursRows = Array.from({ length: 7 }, (_, i) => ({
        specialist_id: specialist.id,
        day_of_week: i,
        start_time: "09:00",
        end_time: "18:00",
        is_working_day: i >= 1 && i <= 5,
      }));
      const { error: whError } = await supabase.from("specialist_work_hours").insert(workHoursRows);
      if (whError) throw whError;
      
      // Set user role to specialist if user assigned
      if (formUserId) {
        await supabase.from("user_roles").update({ role: "specialist" as any }).eq("user_id", formUserId);
      }
    },
    onSuccess: () => {
      toast({ title: "Specialist adăugat cu succes" });
      queryClient.invalidateQueries({ queryKey: ["admin-specialists"] });
      closeDialog();
    },
    onError: () => toast({ title: "Eroare la adăugarea specialistului", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingSpecialist) return;
      const { error } = await supabase
        .from("specialists")
        .update({ name: formName, title: formTitle, is_active: formActive, user_id: formUserId || null })
        .eq("id", editingSpecialist.id);
      if (error) throw error;
      
      // Update role for old user (revert to client)
      if (editingSpecialist.user_id && editingSpecialist.user_id !== formUserId) {
        await supabase.from("user_roles").update({ role: "client" as any }).eq("user_id", editingSpecialist.user_id);
      }
      // Set role for new user
      if (formUserId && formUserId !== editingSpecialist.user_id) {
        await supabase.from("user_roles").update({ role: "specialist" as any }).eq("user_id", formUserId);
      }
    },
    onSuccess: () => {
      toast({ title: "Specialist actualizat" });
      queryClient.invalidateQueries({ queryKey: ["admin-specialists"] });
      closeDialog();
    },
    onError: () => toast({ title: "Eroare la actualizare", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("specialists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Specialist șters" });
      if (selectedSpecialistId === deleteId) setSelectedSpecialistId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-specialists"] });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Ștergerea a eșuat", variant: "destructive" }),
  });

  // Service CRUD now uses specialist_id directly on the services table

  const saveWorkHoursMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSpecialistId) return;
      const updates = Object.entries(editedWorkHours).map(([dayStr, changes]) => {
        const day = Number(dayStr);
        const existing = specialistWorkHours.find((wh) => wh.day_of_week === day);
        if (existing) {
          return {
            id: existing.id,
            data: {
              start_time: (changes.start_time as string) ?? existing.start_time,
              end_time: (changes.end_time as string) ?? existing.end_time,
              is_working_day: (changes.is_working_day as boolean) ?? existing.is_working_day,
            },
          };
        }
        return null;
      }).filter(Boolean) as { id: string; data: any }[];

      for (const u of updates) {
        const { error } = await supabase
          .from("specialist_work_hours")
          .update(u.data)
          .eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Program actualizat" });
      setEditedWorkHours({});
      queryClient.invalidateQueries({ queryKey: ["specialist-work-hours", selectedSpecialistId] });
    },
    onError: () => toast({ title: "Eroare la salvare program", variant: "destructive" }),
  });

  // Service CRUD mutations
  const createServiceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSpecialistId) return;
      const { error } = await supabase.from("services").insert({
        name: serviceForm.name,
        description: serviceForm.description || null,
        duration_minutes: parseInt(serviceForm.duration_minutes),
        price: parseFloat(serviceForm.price),
        specialist_id: selectedSpecialistId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Serviciu adăugat" });
      queryClient.invalidateQueries({ queryKey: ["specialist-services-direct", selectedSpecialistId] });
      closeServiceDialog();
    },
    onError: () => toast({ title: "Eroare la adăugare serviciu", variant: "destructive" }),
  });

  const updateServiceMutation = useMutation({
    mutationFn: async () => {
      if (!editingService) return;
      const { error } = await supabase.from("services").update({
        name: serviceForm.name,
        description: serviceForm.description || null,
        duration_minutes: parseInt(serviceForm.duration_minutes),
        price: parseFloat(serviceForm.price),
      }).eq("id", editingService.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Serviciu actualizat" });
      queryClient.invalidateQueries({ queryKey: ["specialist-services-direct", selectedSpecialistId] });
      closeServiceDialog();
    },
    onError: () => toast({ title: "Eroare la actualizare", variant: "destructive" }),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Serviciu șters" });
      queryClient.invalidateQueries({ queryKey: ["specialist-services-direct", selectedSpecialistId] });
      setDeleteServiceId(null);
    },
    onError: () => toast({ title: "Ștergerea a eșuat", variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSpecialist(null);
    setFormName("");
    setFormTitle("");
    setFormActive(true);
    setFormUserId(null);
  };

  const openCreate = () => {
    setFormName(""); setFormTitle(""); setFormActive(true); setFormUserId(null);
    setEditingSpecialist(null);
    setDialogOpen(true);
  };

  const openEdit = (s: Specialist) => {
    setFormName(s.name); setFormTitle(s.title); setFormActive(s.is_active); setFormUserId(s.user_id || null);
    setEditingSpecialist(s);
    setDialogOpen(true);
  };

  const closeServiceDialog = () => {
    setServiceDialogOpen(false);
    setEditingService(null);
    setServiceForm({ name: "", description: "", duration_minutes: "30", price: "0" });
  };

  const openCreateService = () => {
    setServiceForm({ name: "", description: "", duration_minutes: "30", price: "0" });
    setEditingService(null);
    setServiceDialogOpen(true);
  };

  const openEditService = (s: Service) => {
    setServiceForm({
      name: s.name,
      description: s.description || "",
      duration_minutes: String(s.duration_minutes),
      price: String(s.price),
    });
    setEditingService(s);
    setServiceDialogOpen(true);
  };

  const handleWHChange = (day: number, field: keyof SpecialistWorkHour, value: string | boolean) => {
    setEditedWorkHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const getWHValue = (day: number, field: keyof SpecialistWorkHour) => {
    const edited = editedWorkHours[day]?.[field];
    if (edited !== undefined) return edited;
    const wh = specialistWorkHours.find((w) => w.day_of_week === day);
    return wh?.[field] ?? "";
  };

  const selectedSpecialist = specialists.find((s) => s.id === selectedSpecialistId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Specialists List - hidden for restricted specialist */}
      {!restrictToSpecialistId && (
        <Card variant="elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Specialiști</CardTitle>
              <CardDescription>Gestionează specialiștii salonului</CardDescription>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Adaugă specialist
            </Button>
          </CardHeader>
          <CardContent>
            {specialists.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Niciun specialist adăugat încă. Adaugă primul specialist.
              </p>
            ) : (
              <div className="grid gap-3">
                {specialists.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-all",
                      selectedSpecialistId === s.id ? "ring-2 ring-purple bg-purple/5" : "bg-card hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedSpecialistId(s.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple/10 flex items-center justify-center text-purple font-semibold">
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-sm text-muted-foreground">{s.title || "Specialist"}</p>
                      </div>
                      {!s.is_active && (
                        <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">Inactiv</span>
                      )}
                      {s.user_id && (
                        <span className="text-xs bg-purple/10 text-purple px-2 py-1 rounded-full">Cont asociat</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(s); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selected Specialist Config */}
      {selectedSpecialist && (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Configurare: {selectedSpecialist.name}</CardTitle>
            <CardDescription>Servicii și program de lucru</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-6 max-w-lg">
              <Label htmlFor="booking-slot-mode">{isRo ? "Sloturi programabile" : "Booking slots"}</Label>
              <Select
                value={selectedSpecialist.booking_slot_mode || "fixed"}
                disabled={saveSlotModeMutation.isPending}
                onValueChange={(mode: BookingSlotMode) => saveSlotModeMutation.mutate({ id: selectedSpecialist.id, mode })}
              >
                <SelectTrigger id="booking-slot-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dynamic">{isRo ? "Dinamice — după durata serviciului" : "Dynamic — by service duration"}</SelectItem>
                  <SelectItem value="fixed">{isRo ? "Fixe — la fiecare 15 minute" : "Fixed — every 15 minutes"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Tabs defaultValue="services">
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                <TabsTrigger value="services" className="flex items-center gap-2">
                  <Scissors className="h-4 w-4" />
                  Servicii
                </TabsTrigger>
                <TabsTrigger value="schedule" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Program
                </TabsTrigger>
                <TabsTrigger value="gallery" className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4" />
                  {isRo ? "Galerie Foto" : "Photo Gallery"}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="services">
                <div className="space-y-3">
                  {/* Add new service button */}
                  <div className="flex justify-end mb-2">
                    <Button variant="outline" size="sm" onClick={openCreateService}>
                      <Plus className="h-4 w-4" />
                      Serviciu nou
                    </Button>
                  </div>
                  {specialistServicesList.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">Niciun serviciu. Adaugă primul serviciu.</p>
                  ) : (
                    specialistServicesList.map((service) => (
                      <div key={service.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                        <div className="flex-1">
                          <p className="font-medium">{service.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {service.duration_minutes} min — {Number(service.price)} RON
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditService(service)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteServiceId(service.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="schedule">
                <div className="space-y-3">
                  {ORDERED_WEEK_DAYS.map(({ index, label }) => {
                    const isWorking = getWHValue(index, "is_working_day") as boolean;
                    const startVal = normalizeHHMM(getWHValue(index, "start_time") as string);
                    const endVal = normalizeHHMM(getWHValue(index, "end_time") as string);
                    const startOptions = startVal && !TIME_OPTIONS_24H.includes(startVal)
                      ? [startVal, ...TIME_OPTIONS_24H]
                      : TIME_OPTIONS_24H;
                    const endOptions = endVal && !TIME_OPTIONS_24H.includes(endVal)
                      ? [endVal, ...TIME_OPTIONS_24H]
                      : TIME_OPTIONS_24H;

                    return (
                      <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg border bg-card">
                        <div className="flex items-center gap-3 min-w-[140px]">
                          <Switch
                            checked={isWorking}
                            onCheckedChange={(checked) => handleWHChange(index, "is_working_day", checked)}
                          />
                          <Label className="font-medium">{label}</Label>
                        </div>
                        {isWorking ? (
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex-1">
                              <Label className="text-xs text-muted-foreground">Început</Label>
                              <Select
                                value={startVal}
                                onValueChange={(value) => handleWHChange(index, "start_time", value)}
                              >
                                <SelectTrigger className="mt-1">
                                  <SelectValue placeholder="09:00" />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {startOptions.map((time) => (
                                    <SelectItem key={time} value={time}>
                                      {time}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <span className="text-muted-foreground mt-5">–</span>
                            <div className="flex-1">
                              <Label className="text-xs text-muted-foreground">Sfârșit</Label>
                              <Select
                                value={endVal}
                                onValueChange={(value) => handleWHChange(index, "end_time", value)}
                              >
                                <SelectTrigger className="mt-1">
                                  <SelectValue placeholder="18:00" />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                  {endOptions.map((time) => (
                                    <SelectItem key={time} value={time}>
                                      {time}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Liber</span>
                        )}
                      </div>
                    );
                  })}
                  {Object.keys(editedWorkHours).length > 0 && (
                    <Button
                      variant="hero"
                      onClick={() => saveWorkHoursMutation.mutate()}
                      disabled={saveWorkHoursMutation.isPending}
                      className="mt-4"
                    >
                      {saveWorkHoursMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Salvează program</>}
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="gallery">
                <SalonGalleryManager />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Specialist Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSpecialist ? "Editează specialist" : "Adaugă specialist"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nume</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Numele specialistului" />
            </div>
            <div className="space-y-2">
              <Label>Titlu / Funcție</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="ex: Frizer, Colorist" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <Label>Activ</Label>
            </div>
            {!restrictToSpecialistId && (
              <div className="space-y-2">
                <Label>Cont utilizator asociat</Label>
                <Select value={formUserId || "none"} onValueChange={(v) => setFormUserId(v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Fără cont asociat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără cont asociat</SelectItem>
                    {allProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Asociază un cont existent pentru a permite acces de specialist</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={closeDialog}>Anulează</Button>
              <Button
                onClick={() => editingSpecialist ? updateMutation.mutate() : createMutation.mutate()}
                disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : editingSpecialist ? "Salvează" : "Adaugă"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Service Dialog */}
      <Dialog open={serviceDialogOpen} onOpenChange={closeServiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingService ? "Editează serviciu" : "Adaugă serviciu nou"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nume serviciu</Label>
              <Input value={serviceForm.name} onChange={(e) => setServiceForm(p => ({ ...p, name: e.target.value }))} placeholder="ex: Tuns, Barbă" />
            </div>
            <div className="space-y-2">
              <Label>Descriere</Label>
              <Input value={serviceForm.description} onChange={(e) => setServiceForm(p => ({ ...p, description: e.target.value }))} placeholder="Descriere opțională" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Durată (minute)</Label>
                <Input type="number" value={serviceForm.duration_minutes} onChange={(e) => setServiceForm(p => ({ ...p, duration_minutes: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Preț (RON)</Label>
                <Input type="number" value={serviceForm.price} onChange={(e) => setServiceForm(p => ({ ...p, price: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={closeServiceDialog}>Anulează</Button>
              <Button
                onClick={() => editingService ? updateServiceMutation.mutate() : createServiceMutation.mutate()}
                disabled={!serviceForm.name.trim() || createServiceMutation.isPending || updateServiceMutation.isPending}
              >
                {(createServiceMutation.isPending || updateServiceMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : editingService ? "Salvează" : "Adaugă"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Specialist Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ești sigur?</AlertDialogTitle>
            <AlertDialogDescription>Specialistul va fi șters definitiv.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Șterge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Service Confirmation */}
      <AlertDialog open={!!deleteServiceId} onOpenChange={() => setDeleteServiceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Șterge serviciu?</AlertDialogTitle>
            <AlertDialogDescription>Serviciul va fi șters definitiv din sistem.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteServiceId && deleteServiceMutation.mutate(deleteServiceId)}>Șterge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
