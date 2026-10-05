import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trash } from '@phosphor-icons/react';
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
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** Dev-only gallery of the shadcn primitives in the cookbook theme. `?open=dialog|alert` opens an overlay for screenshots. */
export default function UiGallery() {
  const [params] = useSearchParams();
  const [checked, setChecked] = useState(true);
  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-8 px-4 py-10">
      <h1 className="m-0 font-serif text-4xl">UI gallery</h1>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-serif text-2xl">Buttons</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default">Save plan</Button>
          <Button>Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="ink">Ink</Button>
          <Button variant="destructive">Remove profile</Button>
          <Button variant="danger">Delete kitchen</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="lg" variant="default">
            Large
          </Button>
          <Button size="icon" aria-label="Delete">
            <Trash weight="bold" />
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-name">Name</Label>
          <Input id="g-name" placeholder="Robin" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-invalid">Servings</Label>
          <Input id="g-invalid" aria-invalid defaultValue="-1" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-units">Units</Label>
          <Select defaultValue="us">
            <SelectTrigger id="g-units" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us">US (cups, oz, lb)</SelectItem>
              <SelectItem value="metric">Metric (ml, g, kg)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 self-end pb-3">
          <Checkbox id="g-usual" checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          <Label htmlFor="g-usual">Usually eating with this kitchen</Label>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="g-note">Note</Label>
          <Textarea id="g-note" placeholder="Use the small pan" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-serif text-2xl">Badges, tabs and toggles</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>weeknight</Badge>
          <Badge variant="secondary">quick</Badge>
          <Badge variant="outline">outline</Badge>
          <Badge variant="destructive">conflict</Badge>
        </div>
        <Tabs defaultValue="recipe">
          <TabsList>
            <TabsTrigger value="recipe">Recipe</TabsTrigger>
            <TabsTrigger value="leftovers">Leftovers</TabsTrigger>
            <TabsTrigger value="other">Other</TabsTrigger>
          </TabsList>
          <TabsContent value="recipe" className="text-sm text-foreground-2">
            Pick a saved recipe.
          </TabsContent>
          <TabsContent value="leftovers" className="text-sm text-foreground-2">
            Reuse an earlier meal.
          </TabsContent>
          <TabsContent value="other" className="text-sm text-foreground-2">
            Eating out or a simple label.
          </TabsContent>
        </Tabs>
        <ToggleGroup type="multiple" variant="outline" spacing={2} defaultValue={['dinner']}>
          <ToggleGroupItem value="breakfast">Breakfast</ToggleGroupItem>
          <ToggleGroupItem value="lunch">Lunch</ToggleGroupItem>
          <ToggleGroupItem value="dinner">Dinner</ToggleGroupItem>
          <ToggleGroupItem value="snack">Snack</ToggleGroupItem>
        </ToggleGroup>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingredients</CardTitle>
            <CardDescription>Serves 2</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Separator />
            <p className="m-0">2 cups cherry tomatoes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-wrap gap-2">
        <Dialog defaultOpen={params.get('open') === 'dialog'}>
          <DialogTrigger asChild>
            <Button>Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Kitchen diner</DialogTitle>
              <DialogDescription>Only what you enter here is shared with this kitchen.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-name">Name</Label>
                <Input id="d-name" defaultValue="Robin" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-portions">Usual portions</Label>
                <Input id="d-portions" type="number" defaultValue={1} />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button>Cancel</Button>
              <Button variant="default">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog defaultOpen={params.get('open') === 'alert'}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete kitchen</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Test kitchen?</AlertDialogTitle>
              <AlertDialogDescription>Plans, shopping lists and diner profiles are removed for everyone. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="danger">Delete kitchen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </main>
  );
}
