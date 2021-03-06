import { MatDialog } from '@angular/material/dialog';

import { BehaviorSubject } from 'rxjs';

import { BasePollRepository } from 'app/core/repositories/base-poll-repository';
import { BasePollDialogService } from 'app/core/ui-services/base-poll-dialog.service';
import { ComponentServiceCollector } from 'app/core/ui-services/component-service-collector';
import { PromptService } from 'app/core/ui-services/prompt.service';
import { ChartData } from 'app/shared/components/charts/charts.component';
import { PollState, PollType } from 'app/shared/models/poll/base-poll';
import { BaseComponent } from 'app/site/base/components/base.component';
import { BaseViewPoll } from '../models/base-view-poll';
import { PollService } from '../services/poll.service';

export abstract class BasePollComponent<V extends BaseViewPoll, S extends PollService> extends BaseComponent {
    public chartDataSubject: BehaviorSubject<ChartData> = new BehaviorSubject([]);

    protected _poll: V;

    public pollStateActions = {
        [PollState.Created]: {
            icon: 'play_arrow',
            css: 'start-poll-button'
        },
        [PollState.Started]: {
            icon: 'stop',
            css: 'stop-poll-button'
        },
        [PollState.Finished]: {
            icon: 'public',
            css: 'publish-poll-button'
        }
    };

    public get hideChangeState(): boolean {
        return this._poll.isPublished || (this._poll.isCreated && this._poll.type === PollType.Analog);
    }

    public constructor(
        componentServiceCollector: ComponentServiceCollector,
        protected dialog: MatDialog,
        protected promptService: PromptService,
        protected repo: BasePollRepository,
        protected pollDialog: BasePollDialogService<V, S>
    ) {
        super(componentServiceCollector);
    }

    public async changeState(key: PollState): Promise<void> {
        if (key === PollState.Created) {
            const title = this.translate.instant('Are you sure you want to reset this vote?');
            const content = this.translate.instant('All votes will be lost.');
            if (await this.promptService.open(title, content)) {
                this.repo.resetPoll(this._poll).catch(this.raiseError);
            }
        } else {
            this.repo.changePollState(this._poll).catch(this.raiseError);
        }
    }

    public resetState(): void {
        this.changeState(PollState.Created);
    }

    /**
     * Handler for the 'delete poll' button
     */
    public async onDeletePoll(): Promise<void> {
        const title = this.translate.instant('Are you sure you want to delete this vote?');
        if (await this.promptService.open(title)) {
            await this.repo.delete(this._poll).catch(this.raiseError);
        }
    }

    /**
     * Edits the poll
     */
    public openDialog(): void {
        this.pollDialog.openDialog(this._poll);
    }

    /**
     * Forces to initialize the poll.
     */
    protected initPoll(model: V): void {
        this._poll = model;
    }
}
