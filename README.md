# Goal Metadata for Obsidian

Add a compact, two-row metadata strip under a goal heading. The strip shows priority, target quarter, owner, status, and optional links to documentation, work items, and repositories.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from this repository.
2. Put the three files in `.obsidian/plugins/goal-metadata/` inside your vault. Create the folder if needed. If your vault uses a custom configuration folder, use its `plugins` folder.
3. Reopen the vault. In **Settings → Community plugins**, find and enable **Goal Metadata**. If the vault uses Restricted Mode, follow your team’s policy for enabling community plugins.

This package targets Obsidian Desktop 1.15.1 or later. Styling comes with the plugin. QuickAdd and Dataview are optional and can stay installed for other workflows.

## Use

Open the command palette and search for **Goal Metadata**.

- **Insert New Goal** adds the strip and a set of goal headings to the current note. **Insert Goal Metadata** adds just the strip to an existing goal. Run these in Editing view.
- **Edit Goal Metadata** changes the full strip. The individual update and link commands change one field at a time. Enter one HTTP(S) URL per line. A new strip defaults to the current calendar quarter and year, and you can select **TBD**.
- **Add Goal Decision Log** adds dated entries. **Add Goal Review Checklist** adds a checklist.
- **Open Goal Metadata Generator** opens a live preview with a **Copy metadata HTML** button. Paste the HTML below a goal heading, above **Problem**.
- **Generate Goals Dashboard** opens a vault-wide list. Filter by priority, quarter, owner, or status. Use **Refresh** after editing goals.

Strips from the earlier QuickAdd setup work with this plugin. If you have that setup, use the **Goal Metadata** entries in the command palette to distinguish them from the old **QuickAdd** entries. Generator and dashboard tabs are provided by the plugin. You can keep any older generator and dashboard notes for reference.

## Customize the defaults

Open **Settings → Goal Metadata**. Set names, badge backgrounds, and text colors for P1–P5. The form uses **Documentation**, **Work Item**, and **Repository**. The default link text is **Design Notes**, **Jira Epic**, and **GitHub Repository**. You can rename the link text, set default priorities for new goals and the generator, change the owner and status options, and choose the current quarter, a fixed quarter, or TBD. The goal template settings control section headings and the decision log and review checklist.

Select **Save changes** to apply your preferences. Badge colors apply to existing strips as well. To update the labels in an existing strip, run **Edit Goal Metadata** and save. Existing goal values and dashboard assignments stay in place. Reopen the generator or refresh the dashboard if either was already open. **Reset to defaults** loads the original preferences into the form for review before saving.

## Save and select a configuration

1. Open **Settings → Goal Metadata**, choose a configuration to start from, and customize its defaults. Enter a **Configuration name** and click **Save as new configuration**. To update a saved configuration, select its name and click **Save changes**.
2. Open a goal note and run **Set Note Goal Configuration**. Select the named configuration, or choose **Vault default** to inherit the vault's settings.
3. Use **Insert New Goal**, **Insert Goal Metadata**, or **Edit Goal Metadata**. New and edited strips use the selected configuration. Existing values, dashboard assignments, and HTML stay in place until you edit a strip. The generator also has a configuration selector once you have saved a named configuration.

Under **Optional rankings**, enable **Impact**, **Criticality**, or **Effort** in any combination. Each uses 1 (highest) through 5 (lowest), or **None**. Expand a ranking’s badge colors to set the text and background for each rank. The dashboard adds columns and filters when ratings are present. Saved ratings survive configuration changes. To clear one, select **None** in **Edit Goal Metadata**.

## Dependencies and saved views

Enter one goal dependency per line in **Edit Goal Metadata**, for example `[[2027 Planning/Q1/Infrastructure#Publish API]]`. Use `[[#Publish API]]` for a goal in the same note. The dashboard shows whether each referenced goal is complete, pending, or unresolved. The **Blocked** filter includes goals whose status is Blocked and goals with any pending or unresolved dependency. Set the completion status names in **Settings → Goal Metadata**.

To keep a dashboard scope and its filters, set them in the dashboard, then click **Save view** and name it. Restore them from **Saved view**. Saving again with the same name updates that view.

## Note assignments and properties

**Set Note Goal Configuration** and **Set Note Goals Dashboard** save assignments in the plugin's vault settings. For **Note property**, choose **Plugin settings only** to keep the assignment out of the note, or **Show name in note properties** to write the assigned configuration or dashboard name for an explicit selection. New assignments default to plugin settings only. To update a legacy GUID, reopen the assignment command and save it with **Show name in note properties**. Legacy IDs and readable names can both be read from notes, and a stored assignment takes precedence.

These two plugin properties are hidden in Reading view, and other note properties remain visible. Assignments stored in plugin settings follow notes when moved or renamed in Obsidian. If you rename a configuration or dashboard, the assignment stays linked by its internal ID. To refresh a displayed property name, re-save that assignment.

## Set up dashboards and rollups

1. Run **Goal Metadata → Manage Goals Dashboards** and choose **Create a dashboard**. Name it `2027 Planning` and set **Vault folder** to `2027 Planning`. Folder paths are relative to the vault.
2. Put goal notes in `2027 Planning/Q1` through `2027 Planning/Q4`. They appear in the planning dashboard even if you never create separate quarterly dashboards.
3. For a separate Q1 dashboard, create one scoped to `2027 Planning/Q1`. Leave **Parent dashboard** on **Automatic (from folder)** to roll it up into `2027 Planning`. In the same field, choose a different dashboard or **No parent** any time you create or edit a dashboard. Leave **Vault folder** blank for a dashboard that only receives explicit assignments or child dashboard rollups.
4. Open **Generate Goals Dashboard** and pick the dashboard you want. **All goals** shows every goal, including goals without an assignment.

The plugin assigns each goal to one dashboard. A **Set Goal Dashboard** override takes priority, followed by **Set Note Goals Dashboard**, followed by the closest folder-scoped dashboard. The note setting applies to every goal in that note unless a goal has its own override. Choose **Inherit from note or folder** on a goal or **Use folder default** on a note to clear the override. A dashboard includes its directly assigned goals and the goals in all its descendants. Refresh after editing goals or assignments.

Keep the plugin’s `data.json` in the vault config if you share or migrate a configured dashboard hierarchy. It stores dashboard definitions, saved views, configurations, note assignments, and vault defaults. The installation ZIP starts with an empty dashboard list.

## Remove or upgrade

To remove the plugin, disable **Goal Metadata** and remove its folder from `.obsidian/plugins/`. The goal notes and their metadata HTML stay in your vault. To upgrade, replace `main.js`, `manifest.json`, and `styles.css` in the installed folder and reopen the vault. Keep `data.json` to preserve your dashboard settings.

[Obsidian manual installation reference](https://github.com/obsidianmd/obsidian-sample-plugin#manually-installing-the-plugin)

## License

[MIT](LICENSE).
