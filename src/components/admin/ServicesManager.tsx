import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Scissors, Clock, DollarSign } from "lucide-react";

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
}

interface ServiceFormData {
  name: string;
  description: string;
  duration_minutes: string;
  price: string;
}

const initialFormData: ServiceFormData = {
  name: "",
  description: "",
  duration_minutes: "30",
  price: "25",
};

export function ServicesManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(initialFormData);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["admin-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Service[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      const { error } = await supabase.from("services").insert({
        name: data.name.trim(),
        description: data.description.trim() || null,
        duration_minutes: parseInt(data.duration_minutes),
        price: parseFloat(data.price),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Service created successfully" });
      handleCloseDialog();
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
    },
    onError: () => {
      toast({ title: "Failed to create service", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ServiceFormData }) => {
      const { error } = await supabase
        .from("services")
        .update({
          name: data.name.trim(),
          description: data.description.trim() || null,
          duration_minutes: parseInt(data.duration_minutes),
          price: parseFloat(data.price),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Service updated successfully" });
      handleCloseDialog();
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
    },
    onError: () => {
      toast({ title: "Failed to update service", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Service deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
    },
    onError: () => {
      toast({ title: "Failed to delete service. It may have existing appointments.", variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingService(null);
    setFormData(initialFormData);
    setDialogOpen(true);
  };

  const handleOpenEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      duration_minutes: service.duration_minutes.toString(),
      price: service.price.toString(),
    });
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingService(null);
    setFormData(initialFormData);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Please enter a service name", variant: "destructive" });
      return;
    }

    if (editingService) {
      updateMutation.mutate({ id: editingService.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple" />
      </div>
    );
  }

  return (
    <Card variant="elevated">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Services</CardTitle>
            <CardDescription>
              Manage your service offerings, prices, and durations
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="hero" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" />
                Add Service
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingService ? "Edit Service" : "Add New Service"}
                </DialogTitle>
                <DialogDescription>
                  {editingService
                    ? "Update the service details below"
                    : "Fill in the details for your new service"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Service Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Premium Haircut"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Describe the service..."
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Duration (minutes)</Label>
                    <Input
                      type="number"
                      min="5"
                      step="5"
                      value={formData.duration_minutes}
                      onChange={(e) =>
                        setFormData({ ...formData, duration_minutes: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Price (RON)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) =>
                        setFormData({ ...formData, price: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCloseDialog}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="hero"
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : editingService ? (
                      "Update Service"
                    ) : (
                      "Create Service"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {services.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Scissors className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No services yet. Add your first service to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-purple/10 text-purple">
                    <Scissors className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{service.name}</h3>
                    {service.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {service.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {service.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1 font-medium text-foreground">
                       {Number(service.price).toFixed(2)} RON
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(service)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Service?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{service.name}"? This action
                          cannot be undone. Services with existing appointments cannot be
                          deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(service.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Delete"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
